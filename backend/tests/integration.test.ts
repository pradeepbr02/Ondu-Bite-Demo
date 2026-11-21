import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/db.js';
import { Category, Product, Variant } from '../src/modules/catalog/models.js';
import { Inventory, Reservation } from '../src/modules/inventory/models.js';
import { releaseExpiredReservations, reserveStock } from '../src/modules/inventory/service.js';

const app = createApp({ corsOrigin: 'http://localhost:3000', logRequests: false });
let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDatabase(mongo.getUri('ecom_test'));
  for (const model of [Category, Product, Variant, Inventory, Reservation]) await model.init();
}, 180_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Category.deleteMany({});
  await Product.deleteMany({});
  await Variant.deleteMany({});
  await Inventory.deleteMany({});
  await Reservation.deleteMany({});
});

async function seedProduct() {
  const category = await Category.create({ name: 'Nuts', slug: 'nuts' });
  const product = await Product.create({
    name: 'Almonds',
    slug: 'almonds',
    categoryId: category._id,
    description: 'Demo almonds',
  });
  await Variant.create({
    productId: product._id,
    sku: 'ALMOND-500',
    weightGrams: 500,
    pricePaise: 46900,
  });
  await Inventory.create({ sku: 'ALMOND-500', onHand: 5, reserved: 1 });
  return { category, product };
}

describe('public catalog HTTP API', () => {
  it('boots the demo seed independently and preserves existing prices and stock on replay', async () => {
    const seed = () =>
      promisify(execFile)(process.execPath, ['--import', 'tsx', 'src/scripts/seed.ts'], {
        env: { ...process.env, NODE_ENV: 'test', MONGODB_URI: mongo.getUri('ecom_test') },
      });
    await seed();
    expect(await Category.countDocuments()).toBe(4);
    expect(await Product.countDocuments()).toBe(10);
    expect(await Variant.countDocuments()).toBe(30);
    expect(await Inventory.countDocuments()).toBe(30);
    await Inventory.updateOne({ sku: 'UPMA-500' }, { onHand: 7, reserved: 2 });
    await Variant.updateOne({ sku: 'UPMA-500' }, { pricePaise: 12345 });
    await seed();
    expect(await Inventory.findOne({ sku: 'UPMA-500' }).lean()).toMatchObject({
      onHand: 7,
      reserved: 2,
    });
    expect((await Variant.findOne({ sku: 'UPMA-500' }).lean())!.pricePaise).toBe(12345);
  }, 30_000);

  it('lists products with INR paise prices and variant availability, without internal stock fields', async () => {
    await seedProduct();
    const res = await request(app).get('/api/v1/products?category=nuts&limit=1').expect(200);
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 1 });
    expect(res.body.data[0].variants).toEqual([
      {
        sku: 'ALMOND-500',
        weightGrams: 500,
        pricePaise: 46900,
        currency: 'INR',
        inStock: true,
      },
    ]);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('hides inactive categories, products and variants', async () => {
    const { category, product } = await seedProduct();
    await Variant.updateMany({}, { active: false });
    expect((await request(app).get('/api/v1/products/almonds')).body.data.variants).toEqual([]);
    await Product.updateOne({ _id: product._id }, { active: false });
    await request(app).get('/api/v1/products/almonds').expect(404);
    await Product.updateOne({ _id: product._id }, { active: true });
    await Category.updateOne({ _id: category._id }, { active: false });
    expect((await request(app).get('/api/v1/categories')).body.data).toEqual([]);
    expect((await request(app).get('/api/v1/products')).body.data).toEqual([]);
    await request(app).get('/api/v1/products/almonds').expect(404);
  });

  it('returns product details and treats missing inventory as unavailable', async () => {
    await seedProduct();
    await Inventory.deleteMany({});
    const res = await request(app).get('/api/v1/products/almonds').expect(200);
    expect(res.body.data.description).toBe('Demo almonds');
    expect(res.body.data.variants[0].inStock).toBe(false);
  });

  it('validates query input and gives consistent errors', async () => {
    for (const query of [
      'limit=999',
      'page=-1',
      'category[$ne]=nuts',
      'sort=unknown',
      'limit=1&limit=2',
    ]) {
      const res = await request(app).get(`/api/v1/products?${query}`).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const res = await request(app).get('/api/v1/products/missing').expect(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    await request(app)
      .get('/api/v1/products?category=missing')
      .expect(200, {
        data: [],
        pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
      });
  });

  it('has health probes and no public stock mutation endpoint', async () => {
    await request(app).get('/health/live').expect(200);
    await request(app).get('/health/ready').expect(200);
    await request(app).post('/api/v1/reservations').send({}).expect(404);
    await request(app).post('/api/v1/products').send({}).expect(404);
  });
});

describe('transactional reservation service', () => {
  const input = (items = [{ sku: 'ALMOND-500', quantity: 1 }]) => ({
    checkoutId: randomUUID(),
    ownerId: 'customer-1',
    items,
  });

  it('allows only one of 100 concurrent checkouts to reserve the last pack', async () => {
    await Inventory.create({ sku: 'ALMOND-500', onHand: 1, reserved: 0 });
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () => reserveStock(input())),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failures = results.filter((r) => r.status === 'rejected');
    for (const failure of failures) {
      if (failure.status === 'rejected') expect(failure.reason.code).toBe('INSUFFICIENT_STOCK');
    }
    expect(await Reservation.countDocuments()).toBe(1);
    expect(await Inventory.findOne({ sku: 'ALMOND-500' }).lean()).toMatchObject({
      onHand: 1,
      reserved: 1,
    });
  }, 60_000);

  it('rolls back all SKU reservations when any item is unavailable', async () => {
    await Inventory.create({ sku: 'ALMOND-500', onHand: 5, reserved: 0 });
    await expect(
      reserveStock(
        input([
          { sku: 'ALMOND-500', quantity: 2 },
          { sku: 'CASHEW-500', quantity: 1 },
        ]),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect((await Inventory.findOne().lean())!.reserved).toBe(0);
    expect(await Reservation.countDocuments()).toBe(0);
  });

  it('reuses concurrent duplicate checkout requests and rejects changed content or owner', async () => {
    await Inventory.create({ sku: 'ALMOND-500', onHand: 20, reserved: 0 });
    const sameInput = input();
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveStock(sameInput)));
    expect(new Set(results.map((r) => r._id.toString())).size).toBe(1);
    expect((await Inventory.findOne().lean())!.reserved).toBe(1);
    await expect(reserveStock({ ...sameInput, ownerId: 'another-customer' })).rejects.toMatchObject(
      { code: 'IDEMPOTENCY_CONFLICT' },
    );
    await expect(
      reserveStock({ ...sameInput, items: [{ sku: 'ALMOND-500', quantity: 2 }] }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('releases expired reservations only once, including with two workers', async () => {
    await Inventory.create({ sku: 'ALMOND-500', onHand: 5, reserved: 0 });
    const sameInput = input();
    const reservation = await reserveStock(sameInput);
    const originalExpiry = reservation.expiresAt;
    expect(await releaseExpiredReservations(new Date(originalExpiry.getTime() - 1000))).toBe(0);
    const released = await Promise.all([
      releaseExpiredReservations(new Date(originalExpiry.getTime() + 1000)),
      releaseExpiredReservations(new Date(originalExpiry.getTime() + 1000)),
    ]);
    expect(released.reduce((a, b) => a + b, 0)).toBe(1);
    expect((await Inventory.findOne().lean())!.reserved).toBe(0);
    expect((await Reservation.findById(reservation._id).lean())!.status).toBe('RELEASED');
    const replay = await reserveStock(sameInput);
    expect(replay.status).toBe('RELEASED');
    expect(replay.expiresAt).toEqual(originalExpiry);
    expect((await Inventory.findOne().lean())!.reserved).toBe(0);
  });

  it('rejects nonpositive, fractional and duplicate quantities before changing stock', async () => {
    await Inventory.create({ sku: 'ALMOND-500', onHand: 5, reserved: 0 });
    for (const quantity of [0, -1, 1.5, 21]) {
      await expect(reserveStock(input([{ sku: 'ALMOND-500', quantity }]))).rejects.toThrow();
    }
    await expect(
      reserveStock(
        input([
          { sku: 'ALMOND-500', quantity: 1 },
          { sku: 'ALMOND-500', quantity: 1 },
        ]),
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_SKU' });
    expect((await Inventory.findOne().lean())!.reserved).toBe(0);
  });
});
