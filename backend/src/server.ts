import mongoose from 'mongoose';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { connectDatabase } from './db.js';

async function main() {
  const config = readConfig();
  await connectDatabase(config.MONGODB_URI, config.NODE_ENV === 'production');
  const app = createApp({
    corsOrigin: config.CORS_ORIGIN,
    trustProxyHops: config.TRUST_PROXY_HOPS,
    checkoutEnabled: config.NODE_ENV !== 'production',
    gemini: { apiKey: config.GEMINI_API_KEY, model: config.GEMINI_MODEL },
  });
  const server = app.listen(config.PORT, () => console.log(`API listening on port ${config.PORT}`));
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      void mongoose.disconnect().then(() => {
        clearTimeout(timer);
        process.exit(0);
      });
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(() => {
  console.error('API startup failed. Check configuration and MongoDB connectivity.');
  process.exitCode = 1;
});
