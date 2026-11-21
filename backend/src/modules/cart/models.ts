import { Schema, model } from 'mongoose';

const cartSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true },
    items: {
      type: [
        new Schema(
          {
            sku: { type: String, required: true },
            quantity: {
              type: Number,
              required: true,
              min: 1,
              max: 20,
              validate: Number.isSafeInteger,
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    revision: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const Cart = model('Cart', cartSchema);
