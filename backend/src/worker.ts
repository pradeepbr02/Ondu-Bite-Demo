import { setTimeout } from 'node:timers/promises';
import mongoose from 'mongoose';
import { readConfig } from './config.js';
import { connectDatabase } from './db.js';
import { expireCheckoutHolds } from './modules/checkout/service.js';

async function main() {
  const config = readConfig();
  await connectDatabase(config.MONGODB_URI, config.NODE_ENV === 'production');
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  while (!stopping) {
    try {
      const released = await expireCheckoutHolds();
      if (released)
        console.log(JSON.stringify({ event: 'reservations_released', count: released }));
    } catch {
      console.error('Reservation expiry sweep failed; retrying on the next sweep.');
    }
    if (!stopping) await setTimeout(5000);
  }
  await mongoose.disconnect();
}

main().catch(() => {
  console.error('Worker startup failed. Check MongoDB configuration.');
  process.exitCode = 1;
});
