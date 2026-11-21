import { Schema, model } from 'mongoose';

const categorySchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    displayOrder: { type: Number, default: 0 },
    kannadaName: { type: String, default: '' },
    image: { type: String, default: '' },
    imagePresentation: {
      type: String,
      enum: ['food', 'package', 'package-scene'],
      default: 'food',
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const productSchema = new Schema(
  {
    revision: { type: Number, default: 0 },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    kannadaName: { type: String, default: '' },
    imagePresentation: {
      type: String,
      enum: ['food', 'package', 'package-scene'],
      default: 'food',
    },
    imageNote: { type: String, default: '' },
    description: { type: String, required: true },
    images: { type: [String], default: [] },
    ingredients: { type: [String], default: [] },
    allergens: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
productSchema.index({ active: 1, categoryId: 1, _id: 1 });
productSchema.index({ active: 1, _id: 1 });

const variantSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true, unique: true },
    weightGrams: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    pricePaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
variantSchema.index({ productId: 1, weightGrams: 1 }, { unique: true });

export const Category = model('Category', categorySchema);
export const Product = model('Product', productSchema);
export const Variant = model('Variant', variantSchema);
