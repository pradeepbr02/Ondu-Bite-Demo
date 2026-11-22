import { Schema, model } from 'mongoose';

const customerSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    roleRevision: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

const sessionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ customerId: 1 });

export const Customer = model('Customer', customerSchema);
export const Session = model('Session', sessionSchema);
