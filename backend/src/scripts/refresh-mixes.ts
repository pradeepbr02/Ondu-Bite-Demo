import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { readConfig } from '../config.js';
import { connectDatabase } from '../db.js';
import { mediaConfig } from '../modules/media/config.js';
import { MediaAsset } from '../modules/media/models.js';
import { CatalogMigration } from '../modules/catalog/migration.js';
import { mixPhotoSources } from '../modules/catalog/current-collection.js';
import {
  migrateMixes,
  mixesMigrationKey,
  type ImportedPhoto,
} from '../modules/catalog/mixes-migration.js';

let client: S3Client | undefined;
try {
  const config = readConfig();
  const storage = mediaConfig();
  await connectDatabase(config.MONGODB_URI);
  await CatalogMigration.init();
  await MediaAsset.init();
  if (await CatalogMigration.exists({ key: mixesMigrationKey }))
    console.log('Mixes update already applied; later admin edits preserved.');
  else {
    client = new S3Client({ region: storage.AWS_REGION });
    const photos = new Map<string, ImportedPhoto>();
    for (const source of mixPhotoSources) {
      const sourceUrl = `${source.origin}/products/${source.handle}`;
      const response = await fetch(`${sourceUrl}.js`, {
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Source metadata unavailable.');
      const product = (await response.json()) as { title: string; images: string[] };
      if (!product.images[0]) throw new Error('Source photo missing.');
      const url = new URL(product.images[0], source.origin);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'cdn.shopify.com' ||
        !/^\/s\/files\/1\/(0951\/7462\/3530|0865\/4005\/8946)\//.test(url.pathname)
      )
        throw new Error('Unexpected image host.');
      url.searchParams.set('width', '1200');
      const download = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(45000) });
      if (!download.ok || !download.headers.get('content-type')?.startsWith('image/'))
        throw new Error('Image unavailable.');
      const bytes = Buffer.from(await download.arrayBuffer());
      if (bytes.length > 12 * 1024 * 1024) throw new Error('Image exceeds size limit.');
      const body = await sharp(bytes, { limitInputPixels: 20_000_000 })
        .rotate()
        .resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 86 })
        .toBuffer();
      const sha256 = createHash('sha256').update(body).digest('hex');
      const name = `product-${sha256.slice(0, 24)}`;
      const key = `${storage.prefix}storefront/${name}.webp`;
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: storage.S3_BUCKET,
            Key: key,
            Body: body,
            ContentType: 'image/webp',
            CacheControl: 'public,max-age=31536000,immutable',
            Metadata: { sha256 },
            IfNoneMatch: '*',
          }),
        );
      } catch (e) {
        if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412)
          throw e;
      }
      const check = await client.send(
        new GetObjectCommand({ Bucket: storage.S3_BUCKET, Key: key }),
      );
      if (
        createHash('sha256')
          .update(await check.Body!.transformToByteArray())
          .digest('hex') !== sha256
      )
        throw new Error('Cloud checksum mismatch.');
      await MediaAsset.updateOne(
        { name },
        {
          $set: {
            key,
            sha256,
            contentType: 'image/webp',
            byteLength: body.length,
            attribution: {
              title: product.title,
              author: source.owner,
              sourceUrl,
              license: 'All rights reserved — reference image',
              licenseUrl: sourceUrl,
              changes:
                'Official-brand packaging reference for this preview, resized to WebP. Brand names and photography belong to their respective owners. Printed pack weights and specifications may differ from demo variants.',
            },
          },
        },
        { upsert: true, runValidators: true },
      );
      photos.set(source.slug, { path: `/media/${name}`, note: source.note });
      console.log(
        JSON.stringify({
          product: source.slug,
          uploadedAndVerified: true,
          bytes: body.length,
          localImageFiles: 0,
        }),
      );
    }
    console.log(JSON.stringify(await migrateMixes(photos)));
  }
} catch (e) {
  console.error(
    JSON.stringify({
      message: 'Mixes update failed; catalog changes commit only after all cloud photos verify.',
      type: (e as Error).name,
    }),
  );
  process.exitCode = 1;
} finally {
  client?.destroy();
  await mongoose.disconnect();
}
