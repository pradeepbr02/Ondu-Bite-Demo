import { Schema, model } from 'mongoose';

const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    action: { type: String, required: true },
    target: { type: String, required: true },
    details: { type: Schema.Types.Mixed, required: true },
    operationId: { type: String },
  },
  { timestamps: true },
);
auditSchema.index({ createdAt: -1, _id: -1 });
auditSchema.index({ operationId: 1 }, { unique: true, sparse: true });
export const AdminAudit = model('AdminAudit', auditSchema);

const discountSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['PERCENT', 'FIXED'], required: true },
    value: { type: Number, required: true, min: 1 },
    minSubtotalPaise: { type: Number, default: 0 },
    maxDiscountPaise: { type: Number, default: 0 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    active: { type: Boolean, default: true },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const Discount = model('Discount', discountSchema);
