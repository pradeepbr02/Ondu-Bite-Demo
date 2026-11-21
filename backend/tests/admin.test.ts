import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import sharp from 'sharp';
import { S3Client } from '@aws-sdk/client-s3';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/db.js';
import { Customer } from '../src/modules/identity/models.js';
import { issueSession } from '../src/modules/identity/auth.js';
import { Category, Product, Variant } from '../src/modules/catalog/models.js';
import { Inventory } from '../src/modules/inventory/models.js';
import { AdminAudit, Discount } from '../src/modules/admin/models.js';
import { Order } from '../src/modules/checkout/models.js';
import { MediaAsset } from '../src/modules/media/models.js';
import { calculateDiscount } from '../src/modules/admin/discounts.js';

let mongo: MongoMemoryReplSet;
let app: ReturnType<typeof createApp>;
let token: string;
let customerToken: string;
let adminId: string;
let categoryId: string;
const address = {
  name: 'Test Shopper',
  phone: '9876543210',
  line1: '123 Example Street',
  city: 'Chennai',
  stateCode: 'TN',
  postalCode: '600001',
  country: 'IN' as const,
};
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDatabase(mongo.getUri('admin_test'));
  for (const model of Object.values(mongoose.models)) await model.init();
}, 180_000);
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections))
    await collection.deleteMany({});
  app = createApp({ corsOrigin: 'http://localhost:3000', logRequests: false });
  const admin = await Customer.create({
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: 'fixture',
    role: 'admin',
  });
  adminId = admin.id;
  const customer = await Customer.create({
    name: 'Shopper',
    email: 'shopper@example.com',
    passwordHash: 'fixture',
  });
  token = (await issueSession(admin.id)).accessToken;
  customerToken = (await issueSession(customer.id)).accessToken;
  categoryId = (await Category.create({ name: 'Nuts', slug: 'nuts' })).id;
});
const auth = () => ({ Authorization: `Bearer ${token}` });
function productInput() {
  return {
    name: 'Roasted almonds',
    slug: 'roasted-almonds',
    categoryId,
    description: 'Fresh roasted almonds.',
    active: true,
    images: [],
    ingredients: ['Almonds'],
    allergens: ['Tree nuts'],
    variants: [250, 500, 1000].map((g) => ({
      sku: `ALMONDS-${g}`,
      weightGrams: g,
      pricePaise: g * 100,
      active: true,
    })),
  };
}
async function product() {
  return (
    await request(app).post('/api/v1/admin/products').set(auth()).send(productInput()).expect(201)
  ).body.data;
}
function adjustment(delta: number, operationId = randomUUID()) {
  return { sku: 'ALMONDS-250', delta, reason: 'Test stock receipt', operationId };
}
function couponInput() {
  return {
    code: 'PANTRY10',
    kind: 'PERCENT',
    value: 10,
    minSubtotalPaise: 10000,
    maxDiscountPaise: 10000,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    active: true,
  };
}

describe('admin authorization', () => {
  it('requires an active administrator on every endpoint, including uploads', async () => {
    for (const path of [
      'me',
      'summary',
      'categories',
      'products',
      'inventory',
      'orders',
      'discounts',
      'audit',
    ]) {
      await request(app).get(`/api/v1/admin/${path}`).expect(401);
      await request(app)
        .get(`/api/v1/admin/${path}`)
        .auth(customerToken, { type: 'bearer' })
        .expect(403);
    }
    await request(app)
      .post('/api/v1/admin/products')
      .auth(customerToken, { type: 'bearer' })
      .send(productInput())
      .expect(403);
    await request(app)
      .post('/api/v1/admin/images')
      .auth(customerToken, { type: 'bearer' })
      .set('Content-Type', 'image/png')
      .send(Buffer.from('image'))
      .expect(403);
    expect(await Product.countDocuments()).toBe(0);
  });
  it('rejects privilege injection at signup and immediately honors role revocation', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Attacker',
        email: 'a@example.com',
        password: 'test-password-123',
        role: 'admin',
      })
      .expect(400);
    await Customer.updateOne({ _id: adminId }, { role: 'customer' });
    await request(app).get('/api/v1/admin/me').set(auth()).expect(403);
  });
});
describe('product management', () => {
  it('creates variants with zero stock, exposes database data publicly and records audit', async () => {
    const p = await product();
    expect(p.variants).toHaveLength(3);
    expect(await Inventory.countDocuments({ onHand: 0, reserved: 0 })).toBe(3);
    const catalog = await request(app).get('/api/v1/products').expect(200);
    expect(catalog.body.data[0]).toMatchObject({
      name: 'Roasted almonds',
      variants: expect.arrayContaining([
        expect.objectContaining({ sku: 'ALMONDS-250', inStock: false }),
      ]),
    });
    expect(await AdminAudit.countDocuments({ actorId: adminId, action: 'PRODUCT_CREATED' })).toBe(
      1,
    );
  });
  it('rolls back product and audit creation if any SKU is duplicated', async () => {
    await product();
    await request(app)
      .post('/api/v1/admin/products')
      .set(auth())
      .send({ ...productInput(), slug: 'another-product' })
      .expect(409);
    expect(await Product.countDocuments()).toBe(1);
    expect(await Inventory.countDocuments()).toBe(3);
    expect(await AdminAudit.countDocuments()).toBe(1);
  });
  it('checks revisions, preserves variant identity and supports hiding products', async () => {
    const p = await product();
    const edit = { ...productInput(), revision: 0, name: 'New almonds', active: false };
    const result = await request(app)
      .put(`/api/v1/admin/products/${p.id}`)
      .set(auth())
      .send(edit)
      .expect(200);
    expect(result.body.data.revision).toBe(1);
    await request(app).put(`/api/v1/admin/products/${p.id}`).set(auth()).send(edit).expect(409);
    await request(app)
      .put(`/api/v1/admin/products/${p.id}`)
      .set(auth())
      .send({ ...edit, revision: 1, variants: edit.variants.slice(1) })
      .expect(400);
    expect((await Product.findById(p.id).lean())!.revision).toBe(1);
    expect((await request(app).get('/api/v1/products').expect(200)).body.data).toHaveLength(0);
  });
  it('rejects missing cloud image references and validates category and variant uniqueness', async () => {
    await request(app)
      .post('/api/v1/admin/products')
      .set(auth())
      .send({ ...productInput(), images: ['/media/product-aaaaaaaaaaaaaaaaaaaaaaaa'] })
      .expect(400);
    await request(app)
      .post('/api/v1/admin/products')
      .set(auth())
      .send({ ...productInput(), categoryId: new mongoose.Types.ObjectId().toString() })
      .expect(404);
    const input = productInput();
    input.variants[1]!.sku = input.variants[0]!.sku;
    await request(app).post('/api/v1/admin/products').set(auth()).send(input).expect(400);
  });
});
describe('stock adjustments', () => {
  it('applies once on retry, rejects key reuse and protects reserved packs', async () => {
    await product();
    const input = adjustment(10);
    await request(app)
      .post('/api/v1/admin/inventory/adjustments')
      .set(auth())
      .send(input)
      .expect(200);
    const replay = await request(app)
      .post('/api/v1/admin/inventory/adjustments')
      .set(auth())
      .send(input)
      .expect(200);
    expect(replay.body.data).toMatchObject({ onHand: 10, replayed: true });
    await request(app)
      .post('/api/v1/admin/inventory/adjustments')
      .set(auth())
      .send({ ...input, delta: 20 })
      .expect(409);
    await Inventory.updateOne({ sku: input.sku }, { reserved: 8 });
    await request(app)
      .post('/api/v1/admin/inventory/adjustments')
      .set(auth())
      .send(adjustment(-3))
      .expect(409);
    expect((await Inventory.findOne({ sku: input.sku }).lean())!.onHand).toBe(10);
    expect(await AdminAudit.countDocuments({ action: 'STOCK_ADJUSTED' })).toBe(1);
  });
  it('safely serializes concurrent decrements and duplicate retries', async () => {
    await product();
    await Inventory.updateOne({ sku: 'ALMONDS-250' }, { onHand: 10, reserved: 5 });
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app).post('/api/v1/admin/inventory/adjustments').set(auth()).send(adjustment(-4)),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const input = adjustment(3);
    const retries = await Promise.all(
      [1, 2].map(() =>
        request(app).post('/api/v1/admin/inventory/adjustments').set(auth()).send(input),
      ),
    );
    expect(retries.map((r) => r.status)).toEqual([200, 200]);
    expect((await Inventory.findOne({ sku: 'ALMONDS-250' }).lean())!.onHand).toBe(9);
  });
});
describe('discounts and checkout', () => {
  async function prepare() {
    await product();
    await Inventory.updateMany({}, { onHand: 20 });
    const a = await request(app)
      .post('/api/v1/addresses')
      .auth(customerToken, { type: 'bearer' })
      .send(address)
      .expect(201);
    await request(app)
      .put('/api/v1/cart')
      .auth(customerToken, { type: 'bearer' })
      .send({ revision: 0, items: [{ sku: 'ALMONDS-250', quantity: 4 }] })
      .expect(200);
    return { cartRevision: 1, addressId: a.body.data.id, couponCode: 'PANTRY10' };
  }
  it('calculates discounts server-side, snapshots totals and invalidates stale quotes', async () => {
    const input = await prepare();
    const d = await request(app)
      .post('/api/v1/admin/discounts')
      .set(auth())
      .send(couponInput())
      .expect(201);
    const q = await request(app)
      .post('/api/v1/checkouts/quote')
      .auth(customerToken, { type: 'bearer' })
      .send(input)
      .expect(200);
    expect(q.body.data.totals).toMatchObject({
      subtotalPaise: 100000,
      shippingPaise: 0,
      discountPaise: 10000,
      totalPaise: 90000,
      couponCode: 'PANTRY10',
    });
    await request(app)
      .put(`/api/v1/admin/discounts/${d.body.data.id}`)
      .set(auth())
      .send({ ...couponInput(), value: 5, revision: 0 })
      .expect(200);
    await request(app)
      .post('/api/v1/checkouts')
      .auth(customerToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ ...input, quoteFingerprint: q.body.data.quoteFingerprint })
      .expect(409);
    const next = await request(app)
      .post('/api/v1/checkouts/quote')
      .auth(customerToken, { type: 'bearer' })
      .send(input)
      .expect(200);
    const held = await request(app)
      .post('/api/v1/checkouts')
      .auth(customerToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ ...input, quoteFingerprint: next.body.data.quoteFingerprint })
      .expect(201);
    expect(held.body.data.order.totals).toMatchObject({ discountPaise: 5000, totalPaise: 95000 });
    await Discount.updateOne({}, { active: false });
    expect((await Order.findOne().lean())!.totals.totalPaise).toBe(95000);
  });
  it('rejects invalid/expired coupons, validates ranges and fences concurrent edits', async () => {
    const input = await prepare();
    await request(app)
      .post('/api/v1/checkouts/quote')
      .auth(customerToken, { type: 'bearer' })
      .send(input)
      .expect(409);
    await request(app)
      .post('/api/v1/admin/discounts')
      .set(auth())
      .send({ ...couponInput(), value: 101 })
      .expect(400);
    const d = await request(app)
      .post('/api/v1/admin/discounts')
      .set(auth())
      .send(couponInput())
      .expect(201);
    await request(app).post('/api/v1/admin/discounts').set(auth()).send(couponInput()).expect(409);
    const edit = { ...couponInput(), active: false, revision: 0 };
    await request(app)
      .put(`/api/v1/admin/discounts/${d.body.data.id}`)
      .set(auth())
      .send(edit)
      .expect(200);
    await request(app)
      .put(`/api/v1/admin/discounts/${d.body.data.id}`)
      .set(auth())
      .send(edit)
      .expect(409);
    await request(app)
      .post('/api/v1/checkouts/quote')
      .auth(customerToken, { type: 'bearer' })
      .send(input)
      .expect(409);
  });
  it('rounds percentages down, caps fixed discounts and enforces windows/minimum', () => {
    const base = {
      ...couponInput(),
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 60000),
      minSubtotalPaise: 0,
      maxDiscountPaise: 0,
    };
    expect(calculateDiscount({ ...base, value: 15 }, 999)).toBe(149);
    expect(calculateDiscount({ ...base, kind: 'FIXED', value: 10000 }, 999)).toBe(998);
    expect(calculateDiscount({ ...base, maxDiscountPaise: 50 }, 1000)).toBe(50);
    for (const change of [
      { active: false },
      { minSubtotalPaise: 2000 },
      { startsAt: new Date(Date.now() + 60000) },
      { endsAt: new Date(Date.now() - 1) },
    ])
      expect(() => calculateDiscount({ ...base, ...change }, 1000)).toThrow();
  });
});
describe('order operations', () => {
  async function order() {
    return Order.create({
      orderId: randomUUID(),
      checkoutId: randomUUID(),
      customerId: adminId,
      address,
      items: [
        {
          sku: 'ALMONDS-250',
          name: 'Almonds',
          productSlug: 'almonds',
          weightGrams: 250,
          quantity: 1,
          unitPricePaise: 25000,
          lineTotalPaise: 25000,
        },
      ],
      totals: {
        currency: 'INR',
        subtotalPaise: 25000,
        shippingPaise: 5900,
        totalPaise: 30900,
        pricingMode: 'DEMO',
        policyVersion: 'test',
      },
    });
  }
  it('blocks unpaid fulfillment and enforces one-way, compare-and-set transitions with tracking', async () => {
    const o = await order();
    const path = `/api/v1/admin/orders/${o.orderId}/fulfillment`;
    const process = { expectedStatus: 'UNFULFILLED', status: 'PROCESSING' };
    await request(app).put(path).set(auth()).send(process).expect(409);
    await Order.updateOne({ _id: o._id }, { status: 'CONFIRMED', paymentStatus: 'CAPTURED' });
    await request(app)
      .put(path)
      .set(auth())
      .send({ ...process, status: 'DELIVERED' })
      .expect(409);
    await request(app).put(path).set(auth()).send(process).expect(200);
    await request(app).put(path).set(auth()).send(process).expect(409);
    await request(app)
      .put(path)
      .set(auth())
      .send({ expectedStatus: 'PROCESSING', status: 'SHIPPED' })
      .expect(400);
    await request(app)
      .put(path)
      .set(auth())
      .send({
        expectedStatus: 'PROCESSING',
        status: 'SHIPPED',
        carrier: 'Test courier',
        trackingNumber: 'TEST123',
      })
      .expect(200);
    await request(app)
      .put(path)
      .set(auth())
      .send({ expectedStatus: 'SHIPPED', status: 'DELIVERED' })
      .expect(200);
    const result = await request(app)
      .get(`/api/v1/admin/orders/${o.orderId}`)
      .set(auth())
      .expect(200);
    expect(result.body.data).toMatchObject({
      fulfillmentStatus: 'DELIVERED',
      trackingNumber: 'TEST123',
      carrier: 'Test courier',
    });
    expect(await AdminAudit.countDocuments({ action: 'FULFILLMENT_UPDATED' })).toBe(3);
  });
  it('supports pagination, literal searches, filters and summary without exposing credentials', async () => {
    await order();
    await product();
    const result = await request(app)
      .get('/api/v1/admin/orders?status=PENDING_PAYMENT&limit=1')
      .set(auth())
      .expect(200);
    expect(result.body.pagination.total).toBe(1);
    expect(
      (await request(app).get('/api/v1/admin/products?q=.*').set(auth()).expect(200)).body.data,
    ).toEqual([]);
    const summary = await request(app).get('/api/v1/admin/summary').set(auth()).expect(200);
    expect(summary.body.data).toMatchObject({
      products: 1,
      orders: 1,
      awaitingPayment: 1,
      toFulfill: 0,
      lowStock: 3,
    });
    const audit = await request(app).get('/api/v1/admin/audit').set(auth()).expect(200);
    expect(audit.body.data[0].details).toBeUndefined();
    expect(JSON.stringify(audit.body)).not.toContain('passwordHash');
  });
});
describe('cloud product images', () => {
  it('decodes and uploads to S3 in memory, then permits the returned image on products', async () => {
    vi.stubEnv('AWS_REGION', 'us-east-1');
    vi.stubEnv('S3_BUCKET', 'test-images');
    vi.stubEnv('S3_PREFIX', 'test/');
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const bytes = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#0c8a43' },
    })
      .png()
      .toBuffer();
    const result = await request(app)
      .post('/api/v1/admin/images')
      .set(auth())
      .set('Content-Type', 'image/png')
      .send(bytes)
      .expect(201);
    expect(result.body.data.path).toMatch(/^\/media\/product-[a-f0-9]{24}$/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await MediaAsset.countDocuments()).toBe(1);
    await request(app)
      .post('/api/v1/admin/products')
      .set(auth())
      .send({ ...productInput(), images: [result.body.data.path] })
      .expect(201);
    await request(app)
      .post('/api/v1/admin/images')
      .set(auth())
      .set('Content-Type', 'image/png')
      .send(Buffer.from('not an image'))
      .expect(400);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
