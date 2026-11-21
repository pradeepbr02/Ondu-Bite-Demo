import { Schema, model } from 'mongoose';

const inventorySchema = new Schema(
  {
    sku: { type: String, required: true, unique: true },
    onHand: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    reserved: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  },
  { timestamps: true },
);

const reservationSchema = new Schema(
  {
    checkoutId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    fingerprint: { type: String, required: true },
    items: {
      type: [
        new Schema(
          {
            sku: { type: String, required: true },
            quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
          },
          { _id: false },
        ),
      ],
      required: true,
    },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['ACTIVE', 'CONSUMED', 'RELEASED'], default: 'ACTIVE' },
    releaseReason: { type: String, enum: ['EXPIRED', 'CANCELLED'] },
  },
  { timestamps: true },
);
// Not a TTL index: expiry must release stock transactionally, never delete it.
reservationSchema.index({ status: 1, expiresAt: 1 });

export const Inventory = model('Inventory', inventorySchema);
export const Reservation = model('Reservation', reservationSchema);

const eventSchema = new Schema(
  {
    checkoutId: { type: String, required: true },
    type: { type: String, enum: ['RESERVED', 'RELEASED'], required: true },
    items: {
      type: [new Schema({ sku: String, quantity: Number }, { _id: false })],
      required: true,
    },
    reason: { type: String, enum: ['EXPIRED', 'CANCELLED'] },
  },
  { timestamps: true },
);
eventSchema.index({ checkoutId: 1, type: 1 }, { unique: true });
export const InventoryEvent = model('InventoryEvent', eventSchema);
