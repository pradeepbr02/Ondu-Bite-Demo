import { Router } from 'express';
import { z } from 'zod';
import { type Types } from 'mongoose';
import { Category, Product, Variant } from './models.js';
import { Inventory } from '../inventory/models.js';
import { AppError } from '../../shared/errors.js';

const slug = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const listQuery = z
  .object({
    category: slug.optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(40).default(12),
  })
  .strict();

export const catalogRouter = Router();

catalogRouter.get('/categories', async (_req, res) => {
  const categories = await Category.find({ active: true }).sort({ displayOrder: 1, _id: 1 }).lean();
  res.json({
    data: categories.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      kannadaName: c.kannadaName ?? '',
      image: c.image ?? '',
      imagePresentation: c.imagePresentation ?? 'food',
    })),
  });
});

async function publicVariants(productIds: Types.ObjectId[]) {
  const variants = await Variant.find({ productId: { $in: productIds }, active: true })
    .sort({ weightGrams: 1 })
    .lean();
  const balances = await Inventory.find({ sku: { $in: variants.map((v) => v.sku) } }).lean();
  const available = new Map(balances.map((b) => [b.sku, b.onHand - b.reserved]));
  return variants.map((v) => ({
    productId: v.productId.toString(),
    sku: v.sku,
    weightGrams: v.weightGrams,
    pricePaise: v.pricePaise,
    currency: v.currency,
    inStock: (available.get(v.sku) ?? 0) > 0,
  }));
}

catalogRouter.get('/products', async (req, res) => {
  const query = listQuery.parse(req.query);
  const categories = await Category.find({
    active: true,
    ...(query.category ? { slug: query.category } : {}),
  }).lean();
  const filter = { active: true, categoryId: { $in: categories.map((c) => c._id) } };
  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort({ _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Product.countDocuments(filter),
  ]);
  const variants = await publicVariants(products.map((p) => p._id));
  res.json({
    data: products.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      slug: p.slug,
      images: p.images,
      kannadaName: p.kannadaName ?? '',
      imagePresentation: p.imagePresentation ?? 'food',
      imageNote: p.imageNote ?? '',
      category: categories.find((c) => c._id.equals(p.categoryId))!.slug,
      variants: variants
        .filter((v) => v.productId === p._id.toString())
        .map(({ productId, ...v }) => v),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
});

catalogRouter.get('/products/:slug', async (req, res) => {
  const productSlug = slug.parse(req.params.slug);
  const product = await Product.findOne({ slug: productSlug, active: true }).lean();
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  const category = await Category.findOne({ _id: product.categoryId, active: true }).lean();
  if (!category) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  const variants = await publicVariants([product._id]);
  res.json({
    data: {
      id: product._id.toString(),
      name: product.name,
      slug: product.slug,
      kannadaName: product.kannadaName ?? '',
      imagePresentation: product.imagePresentation ?? 'food',
      imageNote: product.imageNote ?? '',
      category: category.slug,
      description: product.description,
      images: product.images,
      ingredients: product.ingredients,
      allergens: product.allergens,
      variants: variants.map(({ productId, ...v }) => v),
    },
  });
});
