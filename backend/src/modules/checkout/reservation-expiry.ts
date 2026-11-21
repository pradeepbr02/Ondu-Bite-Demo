import { setTimeout } from 'node:timers/promises';
import { expireCheckoutHolds } from './service.js';

export async function runReservationExpiry(signal: AbortSignal) {
  while (!signal.aborted) {
    try {
      const released = await expireCheckoutHolds();
      if (released)
        console.log(JSON.stringify({ event: 'reservations_released', count: released }));
    } catch {
      console.error('Reservation expiry sweep failed; retrying on the next sweep.');
    }
    try {
      await setTimeout(5000, undefined, { signal });
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}
