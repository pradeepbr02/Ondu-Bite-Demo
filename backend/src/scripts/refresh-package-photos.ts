import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { readConfig } from '../config.js';
import { connectDatabase } from '../db.js';
import { mediaConfig } from '../modules/media/config.js';
import { MediaAsset } from '../modules/media/models.js';
import { Category, Product } from '../modules/catalog/models.js';
import { CatalogMigration } from '../modules/catalog/migration.js';

const choices = [
  {
    slug: 'upma',
    origin: 'https://shop.orklaindia.com',
    handle: 'upma-mix',
    owner: 'MTR / Orkla India',
    note: 'MTR reference packaging',
  },
  {
    slug: 'poha',
    origin: 'https://shop.orklaindia.com',
    handle: 'mtr-3-minute-poha-with-10g-protein',
    owner: 'MTR / Orkla India',
    note: 'MTR reference packaging',
  },
  {
    slug: 'idli',
    origin: 'https://shop.orklaindia.com',
    handle: 'rice-idli-mix',
    owner: 'MTR / Orkla India',
    note: 'MTR reference packaging',
  },
  {
    slug: 'pongal',
    origin: 'https://shop.orklaindia.com',
    handle: 'ready-to-eat-pongal',
    owner: 'MTR / Orkla India',
    note: 'MTR reference packaging',
  },
  {
    slug: 'filter-coffee',
    origin: 'https://cothas.com',
    handle: 'specialty-blend',
    owner: 'Cothas Coffee',
    note: 'Cothas reference packaging',
  },
];
let client: S3Client | undefined;
try {
  const config = readConfig();
  const storage = mediaConfig();
  await connectDatabase(config.MONGODB_URI);
  await CatalogMigration.init();
  await MediaAsset.init();
  const migrationKey = 'ondu-reference-package-photos-v1';
  if (await CatalogMigration.exists({ key: migrationKey }))
    console.log('Package photos already applied; later edits preserved.');
  else {
    client = new S3Client({ region: storage.AWS_REGION });
    const photos: { slug: string; path: string; note: string }[] = [];
    for (const source of choices) {
      const sourceUrl = `${source.origin}/products/${source.handle}`;
      const response = await fetch(`${sourceUrl}.js`, {
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Product metadata unavailable.');
      const product = (await response.json()) as { title: string; images: string[] };
      if (!product.images[0]) throw new Error('Package photo missing.');
      const url = new URL(product.images[0], source.origin);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'cdn.shopify.com' ||
        !/^\/s\/files\/1\/(0951\/7462\/3530|0576\/6725\/6475)\//.test(url.pathname)
      )
        throw new Error('Unexpected product image host.');
      url.searchParams.set('width', '1200');
      const download = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(45000) });
      if (!download.ok || !download.headers.get('content-type')?.startsWith('image/'))
        throw new Error('Package photo download failed.');
      const input = Buffer.from(await download.arrayBuffer());
      if (input.length > 12 * 1024 * 1024) throw new Error('Package photo too large.');
      const body = await sharp(input, { limitInputPixels: 20_000_000 })
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 88 })
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
                'Official-brand product photograph, resized to WebP for this store preview. Brand names, packaging and photography belong to their respective owners; shown as packaging references, not Ondu Packet packaging. Displayed pack weights may differ from demo variant options.',
            },
          },
        },
        { upsert: true, runValidators: true },
      );
      photos.push({ slug: source.slug, path: `/media/${name}`, note: source.note });
      console.log(
        JSON.stringify({
          product: source.slug,
          uploadedAndVerified: true,
          bytes: body.length,
          localImageFiles: 0,
        }),
      );
    }
    await mongoose.connection.transaction(async (session) => {
      if (await CatalogMigration.exists({ key: migrationKey }).session(session)) return;
      const changes = [];
      for (const photo of photos) {
        const product = await Product.findOne({ slug: photo.slug, active: true })
          .session(session)
          .lean();
        if (!product) throw new Error('Active catalog product missing.');
        await Product.updateOne(
          { _id: product._id },
          {
            $set: {
              images: [photo.path, ...product.images.filter((i) => i !== photo.path)].slice(0, 8),
              imagePresentation: 'package',
              imageNote: photo.note,
            },
            $inc: { revision: 1 },
          },
          { session },
        );
        changes.push({ slug: photo.slug, before: product.images, after: photo.path });
      }
      await Category.updateOne(
        { slug: 'ready-to-eat' },
        {
          $set: {
            image: photos.find((p) => p.slug === 'upma')!.path,
            imagePresentation: 'package',
          },
        },
        { session },
      );
      await Category.updateOne(
        { slug: 'coffee' },
        {
          $set: {
            image: photos.find((p) => p.slug === 'filter-coffee')!.path,
            imagePresentation: 'package',
          },
        },
        { session },
      );
      await CatalogMigration.create(
        [
          {
            key: migrationKey,
            summary: {
              reason: 'User-requested MTR-style premix and packed filter coffee photo references.',
              changes,
            },
          },
        ],
        { session },
      );
    });
    console.log(
      'Five package photos applied. Prices, stock, orders and previous photos preserved.',
    );
  }
} catch (e) {
  console.error(
    JSON.stringify({
      message:
        'Package photo refresh failed; catalog references change only after all uploads verify.',
      type: (e as Error).name,
    }),
  );
  process.exitCode = 1;
} finally {
  client?.destroy();
  await mongoose.disconnect();
}
