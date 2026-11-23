import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/db.js';
import { Customer, Session } from '../src/modules/identity/models.js';
import { tokenHash } from '../src/modules/identity/auth.js';
import { Cart } from '../src/modules/cart/models.js';
import { Category, Product, Variant } from '../src/modules/catalog/models.js';
import { Inventory } from '../src/modules/inventory/models.js';

let mongo: MongoMemoryReplSet;
let app: ReturnType<typeof createApp>;
const password = 'learning-ecommerce-2026';

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDatabase(mongo.getUri('identity_cart_test'));
  for (const model of [Customer, Session, Cart, Category, Product, Variant, Inventory])
    await model.init();
}, 180_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await Customer.deleteMany({});
  await Session.deleteMany({});
  await Cart.deleteMany({});
  await Category.deleteMany({});
  await Product.deleteMany({});
  await Variant.deleteMany({});
  await Inventory.deleteMany({});
  app = createApp({ corsOrigin: 'http://localhost:3000', logRequests: false });
});

async function signup(email = 'shopper@example.com') {
  return request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Shopper', email, password })
    .expect(201);
}

async function login(email = 'shopper@example.com') {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return res.body.data.accessToken as string;
}

async function authenticatedCustomer(email = 'shopper@example.com') {
  await signup(email);
  return login(email);
}

async function productFixture() {
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
  return { category, product };
}

describe('customer authentication', () => {
  it('creates a phone account only after an approved four-digit SMS verification', async () => {
    const phone = '+919876543210';
    vi.stubEnv('TWILIO_VERIFY_SERVICE_SID', 'VA' + 'a'.repeat(32));
    vi.stubEnv('TWILIO_API_KEY_SID', 'fixture-key');
    vi.stubEnv('TWILIO_API_KEY_SECRET', 'fixture-secret');
    const verify = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ to: phone, status: 'pending' }))
      .mockResolvedValueOnce(Response.json({ to: phone, status: 'pending' }))
      .mockResolvedValueOnce(Response.json({ to: phone, status: 'approved' }));
    vi.stubGlobal('fetch', verify);

    await request(app).post('/api/v1/auth/phone/send').send({ phone: '9876543210' }).expect(204);
    await request(app).post('/api/v1/auth/phone/send').send({ phone }).expect(429);
    await request(app)
      .post('/api/v1/auth/phone/verify')
      .send({ phone, code: '123456' })
      .expect(400);
    await request(app).post('/api/v1/auth/phone/verify').send({ phone, code: '0000' }).expect(400);
    expect(await Customer.countDocuments()).toBe(0);
    const login = await request(app)
      .post('/api/v1/auth/phone/verify')
      .send({ phone, code: '0123' })
      .expect(200);
    expect(login.body.data.customer).toMatchObject({ phone, role: 'customer', email: '' });
    expect(verify.mock.calls[0]?.[1]?.body?.toString()).toBe('To=%2B919876543210&Channel=sms');
    expect(verify.mock.calls[2]?.[1]?.body?.toString()).toBe('To=%2B919876543210&Code=0123');
    await request(app)
      .get('/api/v1/auth/me')
      .auth(login.body.data.accessToken, { type: 'bearer' })
      .expect(200);
  });
  it('normalizes email and stores a salted hash, never the password', async () => {
    const res = await signup('  Shopper@Example.COM ');
    expect(res.body.data.email).toBe('shopper@example.com');
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.password).toBeUndefined();
    const customer = await Customer.findOne().select('+passwordHash').lean();
    expect(customer!.passwordHash).toMatch(/^scrypt-v1\$/);
    expect(customer!.passwordHash).not.toContain(password);
    expect((await Customer.findOne().lean())!.passwordHash).toBeUndefined();
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Again', email: 'SHOPPER@example.com', password })
      .expect(409);
    expect(await Customer.countDocuments()).toBe(1);
  });

  it('rejects weak passwords and caller-supplied privileges', async () => {
    for (const body of [
      { name: 'A', email: 'a@example.com', password: 'short' },
      { name: 'A', email: 'a@example.com', password, role: 'admin' },
    ])
      await request(app).post('/api/v1/auth/register').send(body).expect(400);
    expect(await Customer.countDocuments()).toBe(0);
  });

  it('stores only a token hash, authenticates /me, and revokes the current session on logout', async () => {
    const token = await authenticatedCustomer();
    const stored = await Session.findOne().select('+tokenHash').lean();
    expect(stored!.tokenHash).toBe(tokenHash(token));
    expect(stored!.tokenHash).not.toBe(token);
    const me = await request(app)
      .get('/api/v1/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(me.body.data.email).toBe('shopper@example.com');
    expect(me.body.data.passwordHash).toBeUndefined();
    await request(app).post('/api/v1/auth/logout').auth(token, { type: 'bearer' }).expect(204);
    await request(app).get('/api/v1/auth/me').auth(token, { type: 'bearer' }).expect(401);
  });

  it('uses the same error for unknown email and incorrect password', async () => {
    await signup();
    for (const email of ['shopper@example.com', 'unknown@example.com']) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Email or password is incorrect.');
    }
    expect(await Session.countDocuments()).toBe(0);
  });

  it('rejects expired sessions immediately, independently of TTL cleanup', async () => {
    const token = await authenticatedCustomer();
    await Session.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });
    await request(app).get('/api/v1/auth/me').auth(token, { type: 'bearer' }).expect(401);
  });

  it('rejects disabled customers and revokes all devices only for the current customer', async () => {
    const first = await authenticatedCustomer();
    const second = await login();
    const other = await authenticatedCustomer('other@example.com');
    await request(app).post('/api/v1/auth/logout-all').auth(first, { type: 'bearer' }).expect(204);
    await request(app).get('/api/v1/auth/me').auth(second, { type: 'bearer' }).expect(401);
    await request(app).get('/api/v1/auth/me').auth(other, { type: 'bearer' }).expect(200);
    await Customer.updateOne({ email: 'other@example.com' }, { active: false });
    await request(app).get('/api/v1/auth/me').auth(other, { type: 'bearer' }).expect(401);
  });

  it('rate limits credential requests before doing password work', async () => {
    for (let i = 0; i < 20; i++) await request(app).post('/api/v1/auth/login').send({}).expect(400);
    const res = await request(app).post('/api/v1/auth/login').send({}).expect(429);
    expect(res.body.error.code).toBe('AUTH_RATE_LIMITED');
  });
});

describe('customer cart', () => {
  const items = [{ sku: 'ALMONDS-500', quantity: 2 }];

  it('requires authentication and prevents owner/price injection', async () => {
    await request(app).get('/api/v1/cart').expect(401);
    await request(app).put('/api/v1/cart').send({ revision: 0, items }).expect(401);
    const token = await authenticatedCustomer();
    for (const body of [
      { revision: 0, items, customerId: new mongoose.Types.ObjectId().toString() },
      { revision: 0, items: [{ ...items[0], pricePaise: 1 }] },
    ])
      await request(app).put('/api/v1/cart').auth(token, { type: 'bearer' }).send(body).expect(400);
  });

  it('isolates carts, calculates prices on the server, and does not reserve stock', async () => {
    await productFixture();
    const first = await authenticatedCustomer();
    const second = await authenticatedCustomer('other@example.com');
    const saved = await request(app)
      .put('/api/v1/cart')
      .auth(first, { type: 'bearer' })
      .send({ revision: 0, items })
      .expect(200);
    expect(saved.body.data).toMatchObject({
      revision: 1,
      currency: 'INR',
      subtotalPaise: 93800,
      canCheckout: true,
    });
    const empty = await request(app)
      .get('/api/v1/cart')
      .auth(second, { type: 'bearer' })
      .expect(200);
    expect(empty.body.data.items).toEqual([]);
    expect((await Inventory.findOne().lean())!.reserved).toBe(0);
    await Variant.updateOne({}, { pricePaise: 50000 });
    const repriced = await request(app)
      .get('/api/v1/cart')
      .auth(first, { type: 'bearer' })
      .expect(200);
    expect(repriced.body.data.subtotalPaise).toBe(100000);
  });

  it('allows exactly one concurrent update for a revision and requires a fresh revision to clear', async () => {
    await productFixture();
    const token = await authenticatedCustomer();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .put('/api/v1/cart')
          .auth(token, { type: 'bearer' })
          .send({ revision: 0, items }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    await request(app)
      .put('/api/v1/cart')
      .auth(token, { type: 'bearer' })
      .send({ revision: 0, items: [] })
      .expect(409);
    const cleared = await request(app)
      .put('/api/v1/cart')
      .auth(token, { type: 'bearer' })
      .send({ revision: 1, items: [] })
      .expect(200);
    expect(cleared.body.data).toMatchObject({
      revision: 2,
      items: [],
      subtotalPaise: 0,
      canCheckout: false,
    });
  });

  it('flags stock shortages and discontinued products already in the cart', async () => {
    const { category } = await productFixture();
    const token = await authenticatedCustomer();
    await request(app)
      .put('/api/v1/cart')
      .auth(token, { type: 'bearer' })
      .send({ revision: 0, items })
      .expect(200);
    await Inventory.updateOne({}, { onHand: 1 });
    const shortage = await request(app)
      .get('/api/v1/cart')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(shortage.body.data.canCheckout).toBe(false);
    expect(shortage.body.data.items[0].issue).toBe('INSUFFICIENT_STOCK');
    await Category.updateOne({ _id: category._id }, { active: false });
    const inactive = await request(app)
      .get('/api/v1/cart')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(inactive.body.data.items[0].issue).toBe('PRODUCT_UNAVAILABLE');
    expect(inactive.body.data.subtotalPaise).toBeNull();
    await request(app)
      .put('/api/v1/cart')
      .auth(token, { type: 'bearer' })
      .send({ revision: 1, items })
      .expect(409);
    expect((await Cart.findOne().lean())!.revision).toBe(1);
  });

  it('rejects duplicate SKUs, invalid quantities, unknown SKUs, and missing revisions', async () => {
    await productFixture();
    const token = await authenticatedCustomer();
    for (const body of [
      { revision: 0, items: [...items, ...items] },
      { revision: 0, items: [{ sku: 'ALMONDS-500', quantity: 0 }] },
      { revision: 0, items: [{ sku: 'ALMONDS-500', quantity: 1.5 }] },
      { items },
    ])
      await request(app).put('/api/v1/cart').auth(token, { type: 'bearer' }).send(body).expect(400);
    await request(app)
      .put('/api/v1/cart')
      .auth(token, { type: 'bearer' })
      .send({ revision: 0, items: [{ sku: 'UNKNOWN', quantity: 1 }] })
      .expect(409);
    expect(await Cart.countDocuments()).toBe(0);
  });
});
