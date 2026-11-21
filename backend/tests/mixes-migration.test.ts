import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { connectDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { Category, Product, Variant } from '../src/modules/catalog/models.js';
import { Inventory, Reservation } from '../src/modules/inventory/models.js';
import { CatalogMigration } from '../src/modules/catalog/migration.js';
import { currentCollection, mixPhotoSources } from '../src/modules/catalog/current-collection.js';
import { migrateMixes, type ImportedPhoto } from '../src/modules/catalog/mixes-migration.js';
let mongo: MongoMemoryReplSet;
const photos = new Map<string, ImportedPhoto>(
  mixPhotoSources.map((s, i) => [
    s.slug,
    { path: `/media/product-${String(i + 1).padStart(24, '0')}`, note: s.note },
  ]),
);
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDatabase(mongo.getUri('mixes_test'));
  for (const model of Object.values(mongoose.models)) await model.init();
}, 180000);
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections))
    await collection.deleteMany({});
  // Existing product images and real balances must remain valid across the migration.
  for (const c of currentCollection) {
    const category = await Category.create({ name: c.name, slug: c.slug });
    for (const p of c.products.filter((p) => !photos.has(p.slug))) {
      const product = await Product.create({
        name: p.name,
        slug: p.slug,
        categoryId: category._id,
        description: 'Existing information',
        images: ['/media/product-aaaaaaaaaaaaaaaaaaaaaaaa'],
        imagePresentation: 'package',
      });
      await Variant.create({
        productId: product._id,
        sku: `${p.slug.toUpperCase()}-500`,
        weightGrams: 500,
        pricePaise: 12345,
      });
      await Inventory.create({ sku: `${p.slug.toUpperCase()}-500`, onHand: 7, reserved: 2 });
    }
  }
});
it('replaces dry fruits and Idli without deleting stock, reservations or old product records', async () => {
  const dry = await Category.create({ name: 'Dry fruits', slug: 'dry-fruits' });
  const almonds = await Product.create({
    name: 'Almonds',
    slug: 'almonds',
    categoryId: dry._id,
    description: 'Historical',
  });
  const rte = await Category.findOne({ slug: 'ready-to-eat' });
  const idli = await Product.create({
    name: 'Idli',
    slug: 'idli',
    categoryId: rte!._id,
    description: 'Historical',
  });
  await Inventory.create({ sku: 'IDLI-250', onHand: 12, reserved: 2 });
  await Reservation.create({
    checkoutId: 'old-checkout',
    ownerId: 'customer',
    fingerprint: 'fingerprint',
    items: [{ sku: 'IDLI-250', quantity: 2 }],
    expiresAt: new Date(Date.now() + 60000),
  });
  expect(await migrateMixes(photos)).toMatchObject({ applied: true, products: 10, variants: 30 });
  expect(await Product.findById(almonds._id).lean()).toMatchObject({ active: false });
  expect(await Product.findById(idli._id).lean()).toMatchObject({ active: false });
  expect(await Inventory.findOne({ sku: 'IDLI-250' }).lean()).toMatchObject({
    onHand: 12,
    reserved: 2,
  });
  expect(await Reservation.countDocuments({ checkoutId: 'old-checkout', status: 'ACTIVE' })).toBe(
    1,
  );
  expect(await Inventory.findOne({ sku: 'UPMA-500' }).lean()).toMatchObject({
    onHand: 7,
    reserved: 2,
  });
  expect(await Variant.findOne({ sku: 'UPMA-500' }).lean()).toMatchObject({ pricePaise: 12345 });
  for (const sku of ['RAVA-IDLI-MIX-250', 'GULAB-JAMUN-MIX-500', 'BISIBELE-BATH-1000'])
    expect(await Inventory.findOne({ sku }).lean()).toMatchObject({ onHand: 30, reserved: 0 });
  const app = createApp({ corsOrigin: 'http://localhost:3000', logRequests: false });
  const categories = await request(app).get('/api/v1/categories').expect(200);
  expect(categories.body.data.map((c: { slug: string }) => c.slug)).toEqual([
    'ready-to-eat',
    'ready-to-mix',
    'coffee',
    'snacks',
  ]);
  const mixes = await request(app).get('/api/v1/products?category=ready-to-mix').expect(200);
  expect(mixes.body.data.map((p: { name: string }) => p.name).sort()).toEqual([
    'Gulab Jamun Mix',
    'Rava Idli Mix',
  ]);
  expect((await request(app).get('/api/v1/products/idli')).status).toBe(404);
  expect((await request(app).get('/api/v1/products?limit=40')).body.data).toHaveLength(10);
});
it('preserves later admin stock and photo changes on replay', async () => {
  await migrateMixes(photos);
  await Inventory.updateOne({ sku: 'RAVA-IDLI-MIX-250' }, { onHand: 9 });
  await Product.updateOne(
    { slug: 'rava-idli-mix' },
    { images: ['/media/product-bbbbbbbbbbbbbbbbbbbbbbbb'] },
  );
  expect(await migrateMixes(photos)).toEqual({ applied: false });
  expect(await Inventory.findOne({ sku: 'RAVA-IDLI-MIX-250' }).lean()).toMatchObject({ onHand: 9 });
  expect(await Product.findOne({ slug: 'rava-idli-mix' }).lean()).toMatchObject({
    images: ['/media/product-bbbbbbbbbbbbbbbbbbbbbbbb'],
  });
});
it('makes no partial catalog changes if a replacement photo is missing', async () => {
  await expect(migrateMixes(new Map())).rejects.toThrow('Missing cloud photo');
  expect(await Product.countDocuments()).toBe(4);
  expect(await Product.countDocuments({ slug: 'rava-idli-mix' })).toBe(0);
  expect(await CatalogMigration.countDocuments()).toBe(0);
});
