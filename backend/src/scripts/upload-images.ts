import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { readConfig } from '../config.js';
import { connectDatabase } from '../db.js';
import { mediaConfig, type AssetName } from '../modules/media/config.js';
import { MediaAsset } from '../modules/media/models.js';

let client: S3Client | undefined;
try {
  const config = readConfig();
  const storage = mediaConfig();
  const source = process.argv[2];
  if (!source)
    throw new Error(
      'Supply a source directory containing pantry-hero.png and pantry-categories.png.',
    );
  client = new S3Client({ region: storage.AWS_REGION });
  const records: {
    name: AssetName;
    key: string;
    sha256: string;
    contentType: string;
    byteLength: number;
  }[] = [];
  for (const [name, filename, width] of [
    ['hero', 'pantry-hero.png', 1536],
    ['categories', 'pantry-categories.png', 1920],
  ] as const) {
    const original = await readFile(resolve(source, filename));
    const body = await sharp(original, { limitInputPixels: 20_000_000 })
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const sha256 = createHash('sha256').update(body).digest('hex');
    const key = `${storage.prefix}storefront/${name}-${sha256.slice(0, 24)}.webp`;
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: storage.S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
          Metadata: { sha256 },
          IfNoneMatch: '*',
        }),
      );
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412)
        throw error;
    }
    // Verify the actual cloud bytes before changing any application references.
    const uploaded = await client.send(
      new GetObjectCommand({ Bucket: storage.S3_BUCKET, Key: key }),
    );
    const bytes = await uploaded.Body!.transformToByteArray();
    if (createHash('sha256').update(bytes).digest('hex') !== sha256)
      throw new Error('Uploaded image verification failed.');
    records.push({
      name: name as AssetName,
      key,
      sha256,
      contentType: 'image/webp',
      byteLength: bytes.length,
    });
    console.log(JSON.stringify({ asset: name, uploadedAndVerified: true, bytes: bytes.length }));
  }
  await connectDatabase(config.MONGODB_URI);
  await MediaAsset.init();
  await mongoose.connection.transaction(async (session) => {
    for (const record of records)
      await MediaAsset.updateOne(
        { name: record.name },
        { $set: record },
        { upsert: true, runValidators: true, session },
      );
  });
  console.log('Cloud image manifest saved in MongoDB. No image output files were written locally.');
} catch (error) {
  // AWS messages can contain identifiers or request details. Never log raw errors.
  const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  console.error(
    JSON.stringify({
      message: 'Image migration failed; local source images were preserved.',
      type: failure.name,
      status: failure.$metadata?.httpStatusCode,
    }),
  );
  process.exitCode = 1;
} finally {
  client?.destroy();
  await mongoose.disconnect();
}
