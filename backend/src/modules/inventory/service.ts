import { createHash } from 'node:crypto';
import mongoose, { type ClientSession } from 'mongoose';
import { z } from 'zod';
import { Inventory, Reservation, InventoryEvent } from './models.js';
import { AppError } from '../../shared/errors.js';

const inputSchema = z
  .object({
    checkoutId: z.string().uuid(),
    ownerId: z.string().min(1).max(128),
    items: z
      .array(
        z
          .object({
            sku: z.string().min(1).max(80),
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

type ReservationInput = z.input<typeof inputSchema>;

// Joins the caller's transaction: checkout, order and stock commit together.
export async function reserveStockInSession(
  input: ReservationInput,
  session: ClientSession,
  expiresAt = new Date(Date.now() + 15 * 60 * 1000),
) {
  const parsed = inputSchema.parse(input);
  const items = [...parsed.items].sort((a, b) => a.sku.localeCompare(b.sku));
  if (new Set(items.map((i) => i.sku)).size !== items.length) {
    throw new AppError(400, 'DUPLICATE_SKU', 'Each SKU must appear once.');
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(items)).digest('hex');

  function checkExisting(existing: NonNullable<Awaited<ReturnType<typeof Reservation.findOne>>>) {
    if (existing.ownerId !== parsed.ownerId || existing.fingerprint !== fingerprint) {
      throw new AppError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'Checkout ID was already used for another request.',
      );
    }
    return existing;
  }

  const existing = await Reservation.findOne({ checkoutId: parsed.checkoutId }).session(session);
  if (existing) return checkExisting(existing);

  // Sequential operations inside a transaction; never Promise.all here.
  for (const item of items) {
    const update = await Inventory.updateOne(
      {
        sku: item.sku,
        $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, item.quantity] },
      },
      { $inc: { reserved: item.quantity } },
      { session },
    );
    if (update.modifiedCount !== 1) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${item.sku}.`);
    }
  }
  const [reservation] = await Reservation.create(
    [
      {
        checkoutId: parsed.checkoutId,
        ownerId: parsed.ownerId,
        fingerprint,
        items,
        expiresAt,
      },
    ],
    { session },
  );
  await InventoryEvent.create([{ checkoutId: parsed.checkoutId, type: 'RESERVED', items }], {
    session,
  });
  return reservation!;
}

export async function reserveStock(input: ReservationInput) {
  try {
    return await mongoose.connection.transaction(
      (session) => reserveStockInSession(input, session),
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  } catch (error) {
    // Different transactions can race to insert the same checkoutId.
    if ((error as { code?: number }).code === 11000) {
      // Re-enter the same validation/replay path after a concurrent insert.
      return mongoose.connection.transaction((session) => reserveStockInSession(input, session));
    }
    throw error;
  }
}

export async function releaseReservationInSession(
  checkoutId: string,
  reason: 'EXPIRED' | 'CANCELLED',
  session: ClientSession,
  now = new Date(),
) {
  const reservation = await Reservation.findOneAndUpdate(
    {
      checkoutId,
      status: 'ACTIVE',
      ...(reason === 'EXPIRED' ? { expiresAt: { $lte: now } } : {}),
    },
    { $set: { status: 'RELEASED', releaseReason: reason } },
    { session, returnDocument: 'after' },
  );
  if (!reservation) return null;
  for (const item of reservation.items) {
    const update = await Inventory.updateOne(
      { sku: item.sku, reserved: { $gte: item.quantity } },
      { $inc: { reserved: -item.quantity } },
      { session },
    );
    if (update.modifiedCount !== 1)
      throw new Error('Inventory invariant violation while releasing reservation.');
  }
  await InventoryEvent.create(
    [{ checkoutId, type: 'RELEASED', items: reservation.items, reason }],
    { session },
  );
  return reservation;
}

export async function releaseExpiredReservations(
  now = new Date(),
  batchSize = 100,
  onRelease?: (checkoutId: string, session: ClientSession) => Promise<void>,
) {
  const candidates = await Reservation.find({ status: 'ACTIVE', expiresAt: { $lte: now } })
    .sort({ expiresAt: 1 })
    .limit(batchSize)
    .select('checkoutId')
    .lean();
  let released = 0;
  for (const candidate of candidates) {
    const changed = await mongoose.connection.transaction(
      async (session) => {
        const reservation = await releaseReservationInSession(
          candidate.checkoutId,
          'EXPIRED',
          session,
          now,
        );
        if (!reservation) return false;
        if (onRelease) await onRelease(candidate.checkoutId, session);
        return true;
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    if (changed) released++;
  }
  return released;
}
