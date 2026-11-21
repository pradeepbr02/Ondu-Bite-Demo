import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { z } from 'zod';
import { readConfig } from '../config.js';
import { connectDatabase } from '../db.js';
import { assetNames, mediaConfig } from '../modules/media/config.js';
import { MediaAsset } from '../modules/media/models.js';

let client: S3Client | undefined;
try {
  const config = readConfig();
  const storage = mediaConfig();
  const name = z.enum(assetNames).parse(process.argv[2]);
  const filename = z.string().min(1).parse(process.argv[3]);
  const source = await readFile(resolve(filename));
  const image = sharp(source, { limitInputPixels: 20_000_000 }).resize({
    width: name === 'categories' ? 1920 : name === 'brand' ? 1000 : 1536,
    withoutEnlargement: true,
  });
  const body = await image.webp(name === 'brand' ? { lossless: true } : { quality: 85 }).toBuffer();
  const sha256 = createHash('sha256').update(body).digest('hex');
  const key = `${storage.prefix}storefront/${name}-${sha256.slice(0, 24)}.webp`;
  client = new S3Client({ region: storage.AWS_REGION });
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
  const uploaded = await client.send(new GetObjectCommand({ Bucket: storage.S3_BUCKET, Key: key }));
  const bytes = await uploaded.Body!.transformToByteArray();
  if (createHash('sha256').update(bytes).digest('hex') !== sha256)
    throw new Error('Image verification failed.');
  await connectDatabase(config.MONGODB_URI);
  await MediaAsset.init();
  await MediaAsset.updateOne(
    { name },
    { $set: { key, sha256, contentType: 'image/webp', byteLength: bytes.length } },
    { upsert: true, runValidators: true },
  );
  console.log(
    JSON.stringify({
      asset: name,
      uploadedAndVerified: true,
      bytes: bytes.length,
      storage: 'S3',
      localOutputFiles: 0,
    }),
  );
} catch (error) {
  const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  console.error(
    JSON.stringify({
      message: 'Image upload failed; source was not changed.',
      type: failure.name,
      status: failure.$metadata?.httpStatusCode,
    }),
  );
  process.exitCode = 1;
} finally {
  client?.destroy();
  await mongoose.disconnect();
}
