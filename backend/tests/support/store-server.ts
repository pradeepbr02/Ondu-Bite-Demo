// Test-only HTTP server. It never uses the Atlas URI or real customer data.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/db.js';
import { expireCheckoutHolds } from '../../src/modules/checkout/service.js';

const mongo = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});
const uri = mongo.getUri('store_frontend_test');
await connectDatabase(uri);
for (const model of Object.values(mongoose.models)) await model.init();
await promisify(execFile)(process.execPath, ['--import', 'tsx', 'src/scripts/seed.ts'], {
  env: { ...process.env, NODE_ENV: 'test', MONGODB_URI: uri },
});
const app = express();
const timer = setInterval(() => {
  void expireCheckoutHolds().catch(() => {});
}, 5000);
app.use((_req, res, next) => {
  res.setHeader('X-Store-Test-Database', 'isolated-memory');
  next();
});
app.get('/__test/identity', (_req, res) => res.json({ isolated: true }));
app.post('/__test/stop', (_req, res) => {
  res.status(204).end();
  clearInterval(timer);
  server.close(() => {
    void mongoose
      .disconnect()
      .then(() => mongo.stop())
      .then(() => process.exit(0));
  });
});
app.use(createApp({ corsOrigin: 'http://localhost:3000', logRequests: false }));
const server = app.listen(4010, '127.0.0.1', () =>
  console.log('Isolated storefront test API ready on 4010.'),
);
