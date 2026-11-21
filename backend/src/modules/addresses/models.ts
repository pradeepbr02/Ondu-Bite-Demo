import { Schema, model } from 'mongoose';

export const addressFields = {
  name: { type: String, required: true },
  phone: { type: String, required: true },
  line1: { type: String, required: true },
  line2: { type: String, default: '' },
  city: { type: String, required: true },
  stateCode: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, enum: ['IN'], default: 'IN' },
} as const;

const schema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    ...addressFields,
  },
  { timestamps: true },
);
schema.index({ customerId: 1, _id: 1 });
export const Address = model('Address', schema);
