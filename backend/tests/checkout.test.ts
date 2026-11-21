import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/db.js';
import { Customer } from '../src/modules/identity/models.js';
import { issueSession } from '../src/modules/identity/auth.js';
import { Address } from '../src/modules/addresses/models.js';
import { Cart } from '../src/modules/cart/models.js';
import { Category, Product, Variant } from '../src/modules/catalog/models.js';
import { Inventory, InventoryEvent, Reservation } from '../src/modules/inventory/models.js';
import { Checkout, Order } from '../src/modules/checkout/models.js';
import { expireCheckoutHolds } from '../src/modules/checkout/service.js';

let mongo: MongoMemoryReplSet;
let app: ReturnType<typeof createApp>;
const address = {
  name: 'Test Customer',
  phone: '9876543210',
  line1: '123 Example Street',
  city: 'Chennai',
  stateCode: 'TN',
  postalCode: '600001',
  country: 'IN',
};
const items = [{ sku: 'ALMONDS-500', quantity: 2 }];

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDatabase(mongo.getUri('checkout_test'));
  for (const model of Object.values(mongoose.models)) await model.init();
}, 180_000);
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections))
    await collection.deleteMany({});
  app = createApp({ corsOrigin: 'http://localhost:3000', logRequests: false });
  const category = await Category.create({ name: 'Nuts', slug: 'nuts' });
  const product = await Product.create({
    name: 'Almonds',
    slug: 'almonds',
    categoryId: category._id,
    description: 'Almonds',
  });
  await Variant.create({
    productId: product._id,
    sku: 'ALMONDS-500',
    weightGrams: 500,
    pricePaise: 46900,
  });
  await Inventory.create({ sku: 'ALMONDS-500', onHand: 10, reserved: 0 });
});

async function customer(cartItems = items) {
  const c = await Customer.create({
    name: 'Customer',
    email: `${randomUUID()}@example.com`,
    passwordHash: 'test-fixture-only',
  });
  const { accessToken: token } = await issueSession(c._id.toString());
  const savedAddress = await request(app)
    .post('/api/v1/addresses')
    .auth(token, { type: 'bearer' })
    .send(address)
    .expect(201);
  await request(app)
    .put('/api/v1/cart')
    .auth(token, { type: 'bearer' })
    .send({ revision: 0, items: cartItems })
    .expect(200);
  return { token, customerId: c._id.toString(), addressId: savedAddress.body.data.id as string };
}
type Shopper = Awaited<ReturnType<typeof customer>>;
async function quote(c: Shopper, cartRevision = 1) {
  const res = await request(app)
    .post('/api/v1/checkouts/quote')
    .auth(c.token, { type: 'bearer' })
    .send({ cartRevision, addressId: c.addressId })
    .expect(200);
  return res.body.data;
}
function create(
  c: Shopper,
  q: { quoteFingerprint: string; cartRevision: number },
  key = randomUUID(),
) {
  return request(app)
    .post('/api/v1/checkouts')
    .auth(c.token, { type: 'bearer' })
    .set('Idempotency-Key', key)
    .send({
      cartRevision: q.cartRevision,
      addressId: c.addressId,
      quoteFingerprint: q.quoteFingerprint,
    });
}
async function expire(id: string) {
  const expiresAt = new Date(Date.now() - 1000);
  await Checkout.updateOne({ checkoutId: id }, { expiresAt });
  await Reservation.updateOne({ checkoutId: id }, { expiresAt });
}

describe('owned addresses', () => {
  it('supports CRUD while hiding other customers addresses', async () => {
    const first = await customer();
    const second = await customer();
    const list = await request(app)
      .get('/api/v1/addresses')
      .auth(first.token, { type: 'bearer' })
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].phone).toBe('+919876543210');
    expect(list.body.data[0].customerId).toBeUndefined();
    await request(app)
      .put(`/api/v1/addresses/${first.addressId}`)
      .auth(second.token, { type: 'bearer' })
      .send(address)
      .expect(404);
    await request(app)
      .delete(`/api/v1/addresses/${first.addressId}`)
      .auth(second.token, { type: 'bearer' })
      .expect(404);
    await request(app)
      .put(`/api/v1/addresses/${first.addressId}`)
      .auth(first.token, { type: 'bearer' })
      .send({ ...address, city: 'Madurai' })
      .expect(200);
    await request(app)
      .delete(`/api/v1/addresses/${first.addressId}`)
      .auth(first.token, { type: 'bearer' })
      .expect(204);
    expect(await Address.countDocuments({ customerId: first.customerId })).toBe(0);
  });

  it('validates Indian address syntax and rejects owner injection', async () => {
    const c = await customer();
    await request(app).get('/api/v1/addresses').expect(401);
    for (const body of [
      { ...address, postalCode: '000000' },
      { ...address, country: 'US' },
      { ...address, phone: '123' },
      { ...address, customerId: c.customerId },
      { ...address, stateCode: 'XX' },
    ]) {
      await request(app)
        .post('/api/v1/addresses')
        .auth(c.token, { type: 'bearer' })
        .send(body)
        .expect(400);
    }
  });
});

describe('checkout coordination', () => {
  it('quotes server prices and shipping without holding stock', async () => {
    const c = await customer();
    const q = await quote(c);
    expect(q.totals).toMatchObject({
      subtotalPaise: 93800,
      shippingPaise: 5900,
      totalPaise: 99700,
      pricingMode: 'DEMO',
    });
    expect(q).toMatchObject({ paymentAvailable: false, serviceability: 'UNVERIFIED' });
    expect(await Reservation.countDocuments()).toBe(0);
    expect((await Inventory.findOne().lean())!.reserved).toBe(0);
    for (const [price, shipping] of [
      [99899, 5900],
      [99900, 0],
    ]) {
      await Variant.updateOne({}, { pricePaise: price });
      await Cart.updateOne(
        { customerId: c.customerId },
        { items: [{ sku: 'ALMONDS-500', quantity: 1 }] },
      );
      expect((await quote(c)).totals.shippingPaise).toBe(shipping);
    }
  });

  it('commits checkout, immutable order snapshot, reservation, cart revision and audit event together', async () => {
    const c = await customer();
    const q = await quote(c);
    const result = await create(c, q).expect(201);
    expect(result.body.data).toMatchObject({
      status: 'PREPARING',
      paymentAvailable: false,
      order: {
        status: 'PENDING_PAYMENT',
        paymentStatus: 'UNPAID',
        fulfillmentStatus: 'UNFULFILLED',
      },
    });
    expect(result.body.data.idempotencyKey).toBeUndefined();
    expect(result.body.data.order.customerId).toBeUndefined();
    expect((await Inventory.findOne().lean())!).toMatchObject({ onHand: 10, reserved: 2 });
    expect((await Cart.findOne().lean())!.revision).toBe(2);
    expect(await InventoryEvent.countDocuments({ type: 'RESERVED' })).toBe(1);
    await Variant.updateOne({}, { pricePaise: 100 });
    await request(app)
      .put(`/api/v1/addresses/${c.addressId}`)
      .auth(c.token, { type: 'bearer' })
      .send({ ...address, city: 'Madurai' })
      .expect(200);
    await request(app)
      .put('/api/v1/cart')
      .auth(c.token, { type: 'bearer' })
      .send({ revision: 2, items: [] })
      .expect(200);
    const order = await request(app)
      .get(`/api/v1/orders/${result.body.data.orderId}`)
      .auth(c.token, { type: 'bearer' })
      .expect(200);
    expect(order.body.data.address.city).toBe('Chennai');
    expect(order.body.data.items[0].unitPricePaise).toBe(46900);
    expect(order.body.data.totals).toEqual(q.totals);
  });

  it('collapses concurrent retries into one hold without extending expiry', async () => {
    const c = await customer();
    const q = await quote(c);
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 8 }, () => create(c, q, key)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(7);
    expect(new Set(results.map((r) => r.body.data.checkoutId)).size).toBe(1);
    expect(new Set(results.map((r) => r.body.data.expiresAt)).size).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
    expect(await InventoryEvent.countDocuments({ type: 'RESERVED' })).toBe(1);
    await Address.deleteOne({ _id: c.addressId });
    await create(c, q, key).expect(200);
    await create(c, { ...q, quoteFingerprint: '0'.repeat(64) }, key).expect(409);
    expect((await Inventory.findOne().lean())!.reserved).toBe(2);
  });

  it('allows one active checkout per customer even with different concurrent keys', async () => {
    const c = await customer();
    const q = await quote(c);
    const results = await Promise.all(Array.from({ length: 5 }, () => create(c, q)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await Checkout.countDocuments()).toBe(1);
    const active = await request(app)
      .get('/api/v1/checkouts/active')
      .auth(c.token, { type: 'bearer' })
      .expect(200);
    expect(active.body.data.checkoutId).toBe(
      results.find((r) => r.status === 201)!.body.data.checkoutId,
    );
  });

  it('rolls back the order, checkout, cart claim and earlier SKU holds if any SKU runs out', async () => {
    const product = await Product.findOne();
    await Variant.create({
      productId: product!._id,
      sku: 'Z-ALMONDS-250',
      weightGrams: 250,
      pricePaise: 25000,
    });
    await Inventory.create({ sku: 'Z-ALMONDS-250', onHand: 1, reserved: 0 });
    const c = await customer([...items, { sku: 'Z-ALMONDS-250', quantity: 1 }]);
    const q = await quote(c);
    await Inventory.updateOne({ sku: 'Z-ALMONDS-250' }, { onHand: 0 });
    const result = await create(c, q).expect(409);
    expect(result.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await Checkout.countDocuments()).toBe(0);
    expect(await Order.countDocuments()).toBe(0);
    expect(await Reservation.countDocuments()).toBe(0);
    expect(await InventoryEvent.countDocuments()).toBe(0);
    expect((await Inventory.findOne({ sku: 'ALMONDS-500' }).lean())!.reserved).toBe(0);
    expect((await Cart.findOne().lean())!.revision).toBe(1);
  });

  it('allows only one customer to checkout the final pack', async () => {
    await Inventory.updateOne({}, { onHand: 1 });
    const first = await customer([{ sku: 'ALMONDS-500', quantity: 1 }]);
    const second = await customer([{ sku: 'ALMONDS-500', quantity: 1 }]);
    const q1 = await quote(first);
    const q2 = await quote(second);
    const results = await Promise.all([create(first, q1), create(second, q2)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Order.countDocuments()).toBe(1);
    expect(await Reservation.countDocuments()).toBe(1);
    expect((await Inventory.findOne().lean())!).toMatchObject({ onHand: 1, reserved: 1 });
  });

  it('rejects a stale quote after a price or address change and a stale cart revision', async () => {
    const c = await customer();
    const q = await quote(c);
    await Variant.updateOne({}, { pricePaise: 50000 });
    expect((await create(c, q).expect(409)).body.error.code).toBe('QUOTE_CHANGED');
    const q2 = await quote(c);
    await Address.updateOne({ _id: c.addressId }, { city: 'Madurai' });
    expect((await create(c, q2).expect(409)).body.error.code).toBe('QUOTE_CHANGED');
    const q3 = await quote(c);
    await request(app)
      .put('/api/v1/cart')
      .auth(c.token, { type: 'bearer' })
      .send({ revision: 1, items })
      .expect(200);
    expect((await create(c, q3).expect(409)).body.error.code).toBe('CART_CONFLICT');
    expect(await Reservation.countDocuments()).toBe(0);
  });

  it('fences a cart edit racing with checkout creation', async () => {
    const c = await customer();
    const q = await quote(c);
    const [checkout, edit] = await Promise.all([
      create(c, q),
      request(app)
        .put('/api/v1/cart')
        .auth(c.token, { type: 'bearer' })
        .send({ revision: 1, items: [{ sku: 'ALMONDS-500', quantity: 1 }] }),
    ]);
    if (checkout.status === 201) {
      expect(edit.status).toBe(409);
      expect((await Order.findOne().lean())!.items[0]!.quantity).toBe(2);
      expect((await Inventory.findOne().lean())!.reserved).toBe(2);
    } else {
      expect(checkout.status).toBe(409);
      expect(edit.status).toBe(200);
      expect(await Order.countDocuments()).toBe(0);
      expect((await Inventory.findOne().lean())!.reserved).toBe(0);
    }
    expect((await Cart.findOne().lean())!.revision).toBe(2);
  });

  it('enforces ownership on quotes, checkout reads, cancellation and order history', async () => {
    const c = await customer();
    const other = await customer();
    await request(app)
      .post('/api/v1/checkouts/quote')
      .auth(other.token, { type: 'bearer' })
      .send({ cartRevision: 1, addressId: c.addressId })
      .expect(404);
    const result = await create(c, await quote(c)).expect(201);
    const { checkoutId, orderId } = result.body.data;
    await request(app)
      .get(`/api/v1/checkouts/${checkoutId}`)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    await request(app)
      .post(`/api/v1/checkouts/${checkoutId}/cancel`)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    expect(
      (await request(app).get('/api/v1/orders').auth(other.token, { type: 'bearer' })).body.data,
    ).toEqual([]);
    expect(
      (await request(app).get('/api/v1/orders').auth(c.token, { type: 'bearer' })).body.data,
    ).toHaveLength(1);
  });

  it('cancels exactly once and does not resurrect a cancelled checkout on replay', async () => {
    const c = await customer();
    const q = await quote(c);
    const key = randomUUID();
    const result = await create(c, q, key).expect(201);
    const id = result.body.data.checkoutId;
    const cancels = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app).post(`/api/v1/checkouts/${id}/cancel`).auth(c.token, { type: 'bearer' }),
      ),
    );
    expect(cancels.every((r) => r.status === 200)).toBe(true);
    expect((await Inventory.findOne().lean())!).toMatchObject({ onHand: 10, reserved: 0 });
    expect(await InventoryEvent.countDocuments({ type: 'RELEASED', reason: 'CANCELLED' })).toBe(1);
    expect((await create(c, q, key).expect(200)).body.data.status).toBe('CANCELLED');
    expect((await Order.findOne().lean())!.status).toBe('CANCELLED');
    expect(
      (await request(app).get('/api/v1/checkouts/active').auth(c.token, { type: 'bearer' })).body
        .data,
    ).toBeNull();
  });

  it('expires stock, checkout and order atomically even with duplicate workers', async () => {
    const c = await customer();
    const result = await create(c, await quote(c)).expect(201);
    await expire(result.body.data.checkoutId);
    const counts = await Promise.all([expireCheckoutHolds(), expireCheckoutHolds()]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect((await Checkout.findOne().lean())!.status).toBe('EXPIRED');
    expect((await Order.findOne().lean())!.status).toBe('EXPIRED');
    expect((await Reservation.findOne().lean())!.releaseReason).toBe('EXPIRED');
    expect((await Inventory.findOne().lean())!.reserved).toBe(0);
    // The partial unique index permits a new hold once the previous one closes.
    await create(c, await quote(c, 2)).expect(201);
  });

  it('lazily expires an owned hold when the worker has not run', async () => {
    const c = await customer();
    const q = await quote(c);
    const key = randomUUID();
    const result = await create(c, q, key).expect(201);
    await expire(result.body.data.checkoutId);
    const replay = await create(c, q, key).expect(200);
    expect(replay.body.data.status).toBe('EXPIRED');
    expect(replay.body.data.order.status).toBe('EXPIRED');
    expect((await Inventory.findOne().lean())!.reserved).toBe(0);
  });

  it('rejects price injection, missing keys and anonymous checkout', async () => {
    const c = await customer();
    const q = await quote(c);
    const body = { cartRevision: 1, addressId: c.addressId, quoteFingerprint: q.quoteFingerprint };
    await request(app).post('/api/v1/checkouts').send(body).expect(401);
    await request(app)
      .post('/api/v1/checkouts')
      .auth(c.token, { type: 'bearer' })
      .send(body)
      .expect(400);
    await request(app)
      .post('/api/v1/checkouts')
      .auth(c.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ ...body, totalPaise: 1 })
      .expect(400);
    expect(await Checkout.countDocuments()).toBe(0);
  });

  it('keeps demo quotes and checkout creation disabled in the production app configuration', async () => {
    const c = await customer();
    const production = createApp({
      corsOrigin: 'https://example.com',
      logRequests: false,
      checkoutEnabled: false,
    });
    await request(production)
      .post('/api/v1/checkouts/quote')
      .auth(c.token, { type: 'bearer' })
      .send({ cartRevision: 1, addressId: c.addressId })
      .expect(503);
    await request(production)
      .post('/api/v1/checkouts')
      .auth(c.token, { type: 'bearer' })
      .send({})
      .expect(503);
    expect(await Reservation.countDocuments()).toBe(0);
  });
});
