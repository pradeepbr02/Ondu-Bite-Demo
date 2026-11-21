import mongoose from 'mongoose';
import { readConfig } from './config.js';
import { connectDatabase } from './db.js';
import { runReservationExpiry } from './modules/checkout/reservation-expiry.js';

async function main() {
  const config = readConfig();
  await connectDatabase(config.MONGODB_URI, config.NODE_ENV === 'production');
  const shutdown = new AbortController();
  process.on('SIGINT', () => shutdown.abort());
  process.on('SIGTERM', () => shutdown.abort());
  await runReservationExpiry(shutdown.signal);
  await mongoose.disconnect();
}

main().catch(() => {
  console.error('Worker startup failed. Check MongoDB configuration.');
  process.exitCode = 1;
});
