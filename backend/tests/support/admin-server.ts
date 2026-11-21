// Local review fixture: isolated replica set, no Atlas connection or real orders.
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/db.js';
import { Customer } from '../../src/modules/identity/models.js';
import { hashPassword } from '../../src/modules/identity/passwords.js';
import { Category, Product, Variant } from '../../src/modules/catalog/models.js';
import { Inventory } from '../../src/modules/inventory/models.js';
import { Order } from '../../src/modules/checkout/models.js';

const mongo = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});
await connectDatabase(mongo.getUri('admin_portal_review'));
for (const model of Object.values(mongoose.models)) await model.init();
const admin = await Customer.create({
  name: 'Demo Administrator',
  email: 'admin@example.test',
  role: 'admin',
  passwordHash: await hashPassword('Review-only-password-123'),
});
for (const [name, slug] of [
  ['Nuts', 'nuts'],
  ['Dried fruits', 'dried-fruits'],
  ['Seeds', 'seeds'],
  ['Sweets', 'sweets'],
  ['Snacks', 'snacks'],
]) {
  const category = await Category.create({ name, slug });
  const product = await Product.create({
    name: `${name} selection`,
    slug: `${slug}-selection`,
    categoryId: category._id,
    description: 'Isolated review product',
    active: true,
  });
  for (const grams of [250, 500, 1000]) {
    const sku = `${slug!.toUpperCase()}-${grams}`;
    await Variant.create({
      productId: product._id,
      sku,
      weightGrams: grams,
      pricePaise: grams * 70,
    });
    await Inventory.create({
      sku,
      onHand: grams === 1000 ? 4 : 40,
      reserved: grams === 500 ? 2 : 0,
    });
  }
}
await Order.create({
  orderId: randomUUID(),
  checkoutId: randomUUID(),
  customerId: admin._id,
  status: 'CONFIRMED',
  paymentStatus: 'CAPTURED',
  address: {
    name: 'Demo Customer',
    phone: '+919876543210',
    line1: '123 Test Street',
    city: 'Chennai',
    stateCode: 'TN',
    postalCode: '600001',
    country: 'IN',
  },
  items: [
    {
      sku: 'NUTS-500',
      name: 'Nuts selection',
      productSlug: 'nuts-selection',
      weightGrams: 500,
      quantity: 2,
      unitPricePaise: 35000,
      lineTotalPaise: 70000,
    },
  ],
  totals: {
    currency: 'INR',
    subtotalPaise: 70000,
    shippingPaise: 5900,
    totalPaise: 75900,
    pricingMode: 'DEMO',
    policyVersion: 'review',
  },
});
const app = createApp({ corsOrigin: 'http://localhost:3100', logRequests: false });
const wrapped = (await import('express')).default();
wrapped.use((_req, res, next) => {
  res.setHeader('X-Store-Test-Database', 'isolated-memory');
  next();
});
wrapped.use(app);
const server = wrapped.listen(4015, '127.0.0.1', () =>
  console.log('Isolated admin review API ready on 4015.'),
);
async function stop() {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
