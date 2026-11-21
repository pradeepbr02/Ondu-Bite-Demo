import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import request from 'supertest';
import { connectDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { Category, Product, Variant } from '../src/modules/catalog/models.js';
import { Inventory, Reservation } from '../src/modules/inventory/models.js';
import { MediaAsset } from '../src/modules/media/models.js';
import { migratePantry, CatalogMigration } from '../src/modules/catalog/migration.js';
import { pantryCollection } from '../src/modules/catalog/collection.js';
let mongo: MongoMemoryReplSet;
const images = new Map(
  pantryCollection.flatMap((c) =>
    c.products.map(
      (p, i) => [p.slug, `/media/product-${String(i + 1).padStart(24, '0')}`] as [string, string],
    ),
  ),
);
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDatabase(mongo.getUri('catalog_migration_test'));
  for (const model of Object.values(mongoose.models)) await model.init();
}, 180000);
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections))
    await collection.deleteMany({});
});
it('migrates to exactly four active categories while preserving existing SKU prices and reservations', async () => {
  const old = await Category.create({ name: 'Nuts', slug: 'nuts' });
  const p = await Product.create({
    name: 'Almonds',
    slug: 'almonds',
    categoryId: old._id,
    description: 'Verified existing description',
    revision: 3,
  });
  const hidden = await Product.create({
    name: 'Old snack',
    slug: 'old-snack',
    categoryId: old._id,
    description: 'Historical product',
  });
  await Variant.create({
    productId: p._id,
    sku: 'ALMONDS-500',
    weightGrams: 500,
    pricePaise: 12345,
  });
  await Inventory.create({ sku: 'ALMONDS-500', onHand: 7, reserved: 2 });
  await Reservation.create({
    checkoutId: 'existing-hold',
    ownerId: 'customer',
    fingerprint: 'existing',
    items: [{ sku: 'ALMONDS-500', quantity: 2 }],
    expiresAt: new Date(Date.now() + 60000),
  });
  expect(await migratePantry(images)).toMatchObject({ applied: true, categories: 4, products: 16 });
  expect(await Category.countDocuments({ active: true })).toBe(4);
  expect(await Product.countDocuments({ active: true })).toBe(16);
  expect(await Product.findById(hidden._id).lean()).toMatchObject({ active: false });
  expect(await Product.findById(p._id).lean()).toMatchObject({
    revision: 4,
    description: 'Verified existing description',
  });
  expect(await Variant.findOne({ sku: 'ALMONDS-500' }).lean()).toMatchObject({ pricePaise: 12345 });
  expect(await Inventory.findOne({ sku: 'ALMONDS-500' }).lean()).toMatchObject({
    onHand: 7,
    reserved: 2,
  });
  expect(await Reservation.countDocuments({ checkoutId: 'existing-hold', status: 'ACTIVE' })).toBe(
    1,
  );
  expect(await Inventory.findOne({ sku: 'UPMA-250' }).lean()).toMatchObject({
    onHand: 0,
    reserved: 0,
  });
  const app = createApp({ corsOrigin: 'http://localhost:3000', logRequests: false });
  const c = await request(app).get('/api/v1/categories').expect(200);
  expect(c.body.data.map((c: { slug: string }) => c.slug)).toEqual([
    'ready-to-eat',
    'coffee',
    'snacks',
    'dry-fruits',
  ]);
  const products = await request(app).get('/api/v1/products?category=ready-to-eat').expect(200);
  expect(products.body.data.map((p: { name: string }) => p.name).sort()).toEqual([
    'Idli',
    'Poha',
    'Pongal',
    'Upma',
  ]);
  expect(products.body.data[0].kannadaName).toBeTruthy();
});
it('is replay-safe and does not overwrite later admin changes', async () => {
  await migratePantry(images);
  await Product.updateOne(
    { slug: 'upma' },
    { name: 'Admin edited Upma', active: false, revision: 8 },
  );
  await Inventory.updateOne({ sku: 'UPMA-250' }, { onHand: 12 });
  expect(await migratePantry(images)).toMatchObject({ applied: false });
  expect(await Product.findOne({ slug: 'upma' }).lean()).toMatchObject({
    name: 'Admin edited Upma',
    active: false,
    revision: 8,
  });
  expect(await Inventory.findOne({ sku: 'UPMA-250' }).lean()).toMatchObject({ onHand: 12 });
  expect(await CatalogMigration.countDocuments()).toBe(1);
});
it('leaves the catalog untouched if even one cloud photo is missing', async () => {
  await expect(migratePantry(new Map())).rejects.toThrow('Missing cloud photo');
  expect(await Category.countDocuments()).toBe(0);
  expect(await Product.countDocuments()).toBe(0);
  expect(await CatalogMigration.countDocuments()).toBe(0);
});
it('exposes photo credits without exposing private bucket keys', async () => {
  await MediaAsset.create({
    name: 'product-aaaaaaaaaaaaaaaaaaaaaaaa',
    key: 'private/key.webp',
    sha256: 'a'.repeat(64),
    contentType: 'image/webp',
    byteLength: 100,
    attribution: {
      title: 'Upma',
      author: 'Photographer',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Upma.jpg',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      changes: 'Resized',
    },
  });
  const app = createApp({ corsOrigin: 'http://localhost:3000', logRequests: false });
  const result = await request(app).get('/api/v1/media/credits').expect(200);
  expect(result.body.data[0]).toMatchObject({
    path: '/media/product-aaaaaaaaaaaaaaaaaaaaaaaa',
    author: 'Photographer',
    license: 'CC BY-SA 4.0',
  });
  expect(JSON.stringify(result.body)).not.toContain('private/key');
});
