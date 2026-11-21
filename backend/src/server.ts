import mongoose from 'mongoose';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { connectDatabase } from './db.js';
import { runReservationExpiry } from './modules/checkout/reservation-expiry.js';

async function main() {
  const config = readConfig();
  const demoCheckoutEnabled = config.DEMO_CHECKOUT_ENABLED === 'true';
  await connectDatabase(config.MONGODB_URI, config.NODE_ENV === 'production');
  const app = createApp({
    corsOrigin: config.CORS_ORIGIN,
    trustProxyHops: config.TRUST_PROXY_HOPS,
    checkoutEnabled: config.NODE_ENV !== 'production' || demoCheckoutEnabled,
    gemini: { apiKey: config.GEMINI_API_KEY, model: config.GEMINI_MODEL },
  });
  const server = app.listen(config.PORT, () => console.log(`API listening on port ${config.PORT}`));
  const shutdownSignal = new AbortController();
  const expiry = demoCheckoutEnabled ? runReservationExpiry(shutdownSignal.signal) : undefined;
  if (demoCheckoutEnabled) console.log('Demo checkout and reservation expiry enabled.');
  function shutdown() {
    if (shutdownSignal.signal.aborted) return;
    shutdownSignal.abort();
    const timer = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      void Promise.resolve(expiry)
        .then(() => mongoose.disconnect())
        .then(() => {
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
