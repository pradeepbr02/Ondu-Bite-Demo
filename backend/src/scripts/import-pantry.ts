import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { readConfig } from '../config.js';
import { connectDatabase } from '../db.js';
import { mediaConfig } from '../modules/media/config.js';
import { MediaAsset } from '../modules/media/models.js';
import { pantryCollection } from '../modules/catalog/collection.js';
import { migratePantry, CatalogMigration } from '../modules/catalog/migration.js';

type Source = {
  title: string;
  url: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
};
let client: S3Client | undefined;
try {
  const config = readConfig();
  const storage = mediaConfig();
  const sources: Source[] = JSON.parse(
    await readFile(new URL('./food-photo-sources.json', import.meta.url), 'utf8'),
  );
  await connectDatabase(config.MONGODB_URI);
  await CatalogMigration.init();
  await MediaAsset.init();
  client = new S3Client({ region: storage.AWS_REGION });
  const images = new Map<string, string>();
  for (const category of pantryCollection)
    for (const p of category.products) {
      const source = sources.find((s) => s.title === `File:${p.photo}`);
      if (
        !source ||
        !/^(CC BY(?:-SA)? [234]\.0|CC0)$/.test(source.license) ||
        !source.author ||
        !source.licenseUrl.startsWith('https://creativecommons.org/')
      )
        throw new Error('Missing reusable photo metadata.');
      const previous = await MediaAsset.findOne({
        'attribution.sourceUrl': source.sourceUrl,
      }).lean();
      if (previous) {
        images.set(p.slug, `/media/${previous.name}`);
        console.log(JSON.stringify({ photo: p.slug, reused: true }));
        continue;
      }
      const url = new URL(source.url);
      if (
        !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname) ||
        url.protocol !== 'https:'
      )
        throw new Error('Unexpected image host.');
      url.search = '';
      let response: Response | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt ? Math.min(2000 * 2 ** attempt, 20000) : 1500),
        );
        response = await fetch(url, {
          redirect: 'error',
          signal: AbortSignal.timeout(45000),
          headers: { 'User-Agent': 'OnduPacketCatalog/1.0 (licensed food photo import)' },
        });
        if (response.status !== 429 && response.status < 500) break;
        await response.body?.cancel();
      }
      if (!response) throw new Error('Photo unavailable.');
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/'))
        throw new Error(`Photo download failed: ${p.slug} (${response.status}).`);
      const sourceBytes = Buffer.from(await response.arrayBuffer());
      if (sourceBytes.length > 20 * 1024 * 1024) throw new Error('Image download is too large.');
      const body = await sharp(sourceBytes, { limitInputPixels: 20_000_000 })
        .rotate()
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
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
            CacheControl: 'public, max-age=31536000, immutable',
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
              title: source.title.slice(5),
              sourceUrl: source.sourceUrl,
              author: source.author,
              license: source.license,
              licenseUrl: source.licenseUrl,
              changes:
                'Resized and converted to WebP; displayed with responsive crops. Photo remains available under its original license.',
            },
          },
        },
        { upsert: true, runValidators: true },
      );
      images.set(p.slug, `/media/${name}`);
      console.log(
        JSON.stringify({
          photo: p.slug,
          uploadedAndVerified: true,
          bytes: body.length,
          localImageFiles: 0,
        }),
      );
    }
  console.log(JSON.stringify(await migratePantry(images)));
} catch (e) {
  const err = e as { name?: string; message?: string };
  console.error(
    JSON.stringify({
      message: 'Pantry import failed; catalog changes commit only after all images are ready.',
      type: err.name,
      detail: err.message?.replace(/mongodb[^\s]+/g, '[database]'),
    }),
  );
  process.exitCode = 1;
} finally {
  client?.destroy();
  await mongoose.disconnect();
}
