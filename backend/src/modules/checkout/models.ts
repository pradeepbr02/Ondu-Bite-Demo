import { Schema, model } from 'mongoose';
import { addressFields } from '../addresses/models.js';

export const totalsSchema = new Schema(
  {
    currency: { type: String, enum: ['INR'], required: true },
    subtotalPaise: { type: Number, required: true },
    discountPaise: { type: Number, default: 0 },
    couponCode: { type: String, default: '' },
    shippingPaise: { type: Number, required: true },
    totalPaise: { type: Number, required: true },
    pricingMode: { type: String, enum: ['DEMO'], required: true },
    policyVersion: { type: String, required: true },
  },
  { _id: false },
);

const checkoutSchema = new Schema(
  {
    checkoutId: { type: String, required: true, unique: true },
    orderId: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    idempotencyKey: { type: String, required: true },
    requestFingerprint: { type: String, required: true },
    cartRevision: { type: Number, required: true },
    status: {
      type: String,
      enum: ['PREPARING', 'PAYMENT_PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
      default: 'PREPARING',
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
checkoutSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
checkoutSchema.index(
  { customerId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['PREPARING', 'PAYMENT_PENDING'] } },
    name: 'one_active_checkout_per_customer',
  },
);

const orderSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true },
    checkoutId: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: {
      type: String,
      enum: ['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'PAYMENT_REVIEW'],
      default: 'PENDING_PAYMENT',
    },
    paymentStatus: { type: String, enum: ['UNPAID', 'CAPTURED'], default: 'UNPAID' },
    fulfillmentStatus: {
      type: String,
      enum: ['UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
      default: 'UNFULFILLED',
    },
    trackingNumber: { type: String, default: '' },
    carrier: { type: String, default: '' },
    contactEmail: { type: String },
    address: { type: new Schema(addressFields, { _id: false }), required: true },
    items: {
      type: [
        new Schema(
          {
            sku: { type: String, required: true },
            name: { type: String, required: true },
            productSlug: { type: String, required: true },
            weightGrams: { type: Number, required: true },
            quantity: { type: Number, required: true },
            unitPricePaise: { type: Number, required: true },
            lineTotalPaise: { type: Number, required: true },
          },
          { _id: false },
        ),
      ],
      required: true,
    },
    totals: { type: totalsSchema, required: true },
  },
  { timestamps: true },
);
orderSchema.index({ customerId: 1, _id: -1 });
orderSchema.index({ createdAt: -1, _id: -1 });
orderSchema.index({ status: 1, fulfillmentStatus: 1, createdAt: -1 });

export const Checkout = model('Checkout', checkoutSchema);
export const Order = model('Order', orderSchema);
