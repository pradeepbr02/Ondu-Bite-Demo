import { Router } from 'express';
import mongoose, { type ClientSession } from 'mongoose';
import { z } from 'zod';
import { requireCustomer, requireAdmin } from '../identity/auth.js';
import { Customer, Session } from '../identity/models.js';
import { Category, Product, Variant } from '../catalog/models.js';
import { Inventory } from '../inventory/models.js';
import { Order } from '../checkout/models.js';
import { orderDto } from '../checkout/service.js';
import { AppError } from '../../shared/errors.js';
import { AdminAudit, Discount } from './models.js';
import { MediaAsset } from '../media/models.js';

const id = z.string().regex(/^[a-f0-9]{24}$/);
const sku = z.string().regex(/^[A-Z0-9-]{1,80}$/);
const integer = z.number().int().min(0).max(100_000_000);
const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(100).default(''),
});
const variantBody = z
  .object({
    sku,
    weightGrams: z.number().int().min(1).max(100000),
    pricePaise: integer.min(1),
    active: z.boolean(),
  })
  .strict();
const productBody = z
  .object({
    name: z.string().trim().min(1).max(160),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    kannadaName: z.string().trim().max(100).optional(),
    imagePresentation: z.enum(['food', 'package', 'package-scene']).optional(),
    imageNote: z.string().trim().max(200).optional(),
    categoryId: id,
    description: z.string().trim().min(1).max(5000),
    active: z.boolean(),
    images: z.array(z.string().regex(/^\/media\/product-[a-f0-9]{24}$/)).max(8),
    ingredients: z.array(z.string().trim().min(1).max(150)).max(40),
    allergens: z.array(z.string().trim().min(1).max(150)).max(40),
    variants: z.array(variantBody).min(1).max(30),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      new Set(p.variants.map((v) => v.sku)).size !== p.variants.length ||
      new Set(p.variants.map((v) => v.weightGrams)).size !== p.variants.length
    )
      ctx.addIssue({ code: 'custom', message: 'Variant SKUs and weights must be unique.' });
  });
const discountBody = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,30}$/),
    kind: z.enum(['PERCENT', 'FIXED']),
    value: integer.min(1),
    minSubtotalPaise: integer,
    maxDiscountPaise: integer,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    active: z.boolean(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.kind === 'PERCENT' && d.value > 100)
      ctx.addIssue({ code: 'custom', message: 'Percentage cannot exceed 100.' });
    if (Date.parse(d.endsAt) <= Date.parse(d.startsAt))
      ctx.addIssue({ code: 'custom', message: 'End must follow start.' });
  });
const tx = {
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
};
const roleBody = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    role: z.enum(['admin', 'customer']),
  })
  .strict();
const conflict = () =>
  new AppError(409, 'EDIT_CONFLICT', 'This record changed. Reload it before saving again.');
const search = (q: string) => new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
function pageInfo(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
async function audit(
  actorId: string,
  action: string,
  target: string,
  details: unknown,
  session: ClientSession,
  operationId?: string,
) {
  await AdminAudit.create(
    [{ actorId, action, target, details, ...(operationId ? { operationId } : {}) }],
    { session },
  );
}
async function uniqueWrite<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      throw new AppError(
        409,
        'DUPLICATE_RECORD',
        'A slug, SKU, weight or coupon code is already in use.',
      );
    throw e;
  }
}
async function productRecord(productId: string) {
  const p = await Product.findById(productId).lean();
  if (!p) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  return {
    ...p,
    id: p._id.toString(),
    revision: p.revision ?? 0,
    variants: await Variant.find({ productId }).sort({ weightGrams: 1 }).lean(),
  };
}
async function validateImages(images: string[], session: ClientSession) {
  const names = [...new Set(images.map((path) => path.slice('/media/'.length)))];
  if ((await MediaAsset.countDocuments({ name: { $in: names } }).session(session)) !== names.length)
    throw new AppError(400, 'IMAGE_NOT_FOUND', 'Upload product images before using them.');
}

export const adminRouter = Router();
adminRouter.use(requireCustomer, requireAdmin);
adminRouter.get('/me', (_req, res) => res.json({ data: res.locals.customer }));
adminRouter.put('/access', async (req, res) => {
  const { email, role } = roleBody.parse(req.body);
  const actor = res.locals.customer;
  if (actor.email === email)
    throw new AppError(409, 'SELF_ROLE_CHANGE', 'Ask another administrator to change your access.');

  const data = await mongoose.connection.transaction(async (session) => {
    // Write to the actor so concurrent revocations cannot both rely on stale admin roles.
    const admin = await Customer.updateOne(
      { _id: actor.id, active: true, role: 'admin' },
      { $inc: { roleRevision: 1 } },
      { session },
    );
    if (!admin.matchedCount)
      throw new AppError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
    const activeSession = await Session.exists({
      _id: res.locals.sessionId,
      customerId: actor.id,
      expiresAt: { $gt: new Date() },
    }).session(session);
    if (!activeSession) throw new AppError(401, 'UNAUTHENTICATED', 'A valid session is required.');

    const target = await Customer.findOne({
      email,
      active: true,
      guest: { $ne: true },
      verifiedPhone: { $exists: false },
    }).session(session);
    if (!target)
      throw new AppError(
        404,
        'ACCOUNT_NOT_FOUND',
        'No active account is registered with that email.',
      );

    const previousRole = target.role ?? 'customer';
    if (previousRole === role) return { email, role, changed: false };

    target.role = role;
    await target.save({ session });
    await Session.deleteMany({ customerId: target._id }, { session });
    await audit(actor.id, 'ROLE_CHANGED', target.id, { previousRole, role }, session);
    return { email, role, changed: true };
  }, tx);
  res.json({ data });
});
adminRouter.get('/summary', async (_req, res) => {
  const [products, orders, awaitingPayment, toFulfill, lowStock] = await Promise.all([
    Product.countDocuments({ active: true }),
    Order.countDocuments(),
    Order.countDocuments({ status: 'PENDING_PAYMENT' }),
    Order.countDocuments({
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      fulfillmentStatus: { $in: ['UNFULFILLED', 'PROCESSING'] },
    }),
    Inventory.countDocuments({ $expr: { $lte: [{ $subtract: ['$onHand', '$reserved'] }, 5] } }),
  ]);
  res.json({ data: { products, orders, awaitingPayment, toFulfill, lowStock } });
});
adminRouter.get('/categories', async (_req, res) =>
  res.json({ data: await Category.find().sort({ displayOrder: 1 }).lean() }),
);
adminRouter.get('/products', async (req, res) => {
  const { page, limit, q } = pagination.parse(req.query);
  const filter = q ? { $or: [{ name: search(q) }, { slug: search(q) }] } : {};
  const [rows, total] = await Promise.all([
    Product.find(filter)
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);
  const categories = await Category.find({ _id: { $in: rows.map((p) => p.categoryId) } }).lean();
  res.json({
    data: rows.map((p) => ({
      ...p,
      id: p._id.toString(),
      categoryName: categories.find((c) => c._id.equals(p.categoryId))?.name ?? 'Unknown',
      revision: p.revision ?? 0,
    })),
    pagination: pageInfo(page, limit, total),
  });
});
adminRouter.get('/products/:id', async (req, res) =>
  res.json({ data: await productRecord(id.parse(req.params.id)) }),
);
adminRouter.post('/products', async (req, res) => {
  const input = productBody.parse(req.body);
  const productId = await uniqueWrite(() =>
    mongoose.connection.transaction(async (session) => {
      if (!(await Category.exists({ _id: input.categoryId }).session(session)))
        throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
      const { variants, ...fields } = input;
      await validateImages(input.images, session);
      const [p] = await Product.create([fields], { session });
      for (const v of variants) {
        await Variant.create([{ ...v, productId: p!._id }], { session });
        await Inventory.create([{ sku: v.sku, onHand: 0, reserved: 0 }], { session });
      }
      await audit(res.locals.customer.id, 'PRODUCT_CREATED', p!.id, input, session);
      return p!.id;
    }, tx),
  );
  res.status(201).json({ data: await productRecord(productId) });
});
adminRouter.put('/products/:id', async (req, res) => {
  const productId = id.parse(req.params.id);
  const { revision, ...input } = productBody.safeExtend({ revision: integer }).parse(req.body);
  await uniqueWrite(() =>
    mongoose.connection.transaction(async (session) => {
      if (!(await Category.exists({ _id: input.categoryId }).session(session)))
        throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
      const { variants, ...fields } = input;
      await validateImages(input.images, session);
      const old = await Product.findById(productId).session(session).lean();
      if (!old) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
      const revisionFilter =
        revision === 0
          ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
          : { revision };
      const result = await Product.updateOne(
        { _id: productId, ...revisionFilter },
        { $set: fields, $inc: { revision: 1 } },
        { session, runValidators: true },
      );
      if (!result.modifiedCount) throw conflict();
      const existing = await Variant.find({ productId }).session(session).lean();
      // SKUs/weights are permanent identifiers. Hide old variants instead of deleting or repurposing them.
      for (const oldVariant of existing) {
        const replacement = variants.find((v) => v.sku === oldVariant.sku);
        if (!replacement || replacement.weightGrams !== oldVariant.weightGrams)
          throw new AppError(
            400,
            'IMMUTABLE_VARIANT',
            'Keep existing SKUs and weights; deactivate variants instead of removing them.',
          );
      }
      for (const v of variants) {
        if (existing.some((e) => e.sku === v.sku))
          await Variant.updateOne(
            { productId, sku: v.sku },
            { $set: v },
            { session, runValidators: true },
          );
        else {
          await Variant.create([{ ...v, productId }], { session });
          await Inventory.create([{ sku: v.sku, onHand: 0, reserved: 0 }], { session });
        }
      }
      await audit(
        res.locals.customer.id,
        'PRODUCT_UPDATED',
        productId,
        { before: { ...old, variants: existing }, after: input },
        session,
      );
    }, tx),
  );
  res.json({ data: await productRecord(productId) });
});
adminRouter.get('/inventory', async (req, res) => {
  const { page, limit, q } = pagination.parse(req.query);
  const filter = q ? { sku: search(q) } : {};
  const [rows, total] = await Promise.all([
    Inventory.find(filter)
      .sort({ sku: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Inventory.countDocuments(filter),
  ]);
  res.json({
    data: rows.map((r) => ({
      sku: r.sku,
      onHand: r.onHand,
      reserved: r.reserved,
      available: r.onHand - r.reserved,
    })),
    pagination: pageInfo(page, limit, total),
  });
});
adminRouter.post('/inventory/adjustments', async (req, res) => {
  const input = z
    .object({
      operationId: z.uuid(),
      sku,
      delta: z
        .number()
        .int()
        .min(-1_000_000)
        .max(1_000_000)
        .refine((v) => v !== 0),
      reason: z.string().trim().min(3).max(300),
    })
    .strict()
    .parse(req.body);
  const actorId = res.locals.customer.id as string;
  const apply = () =>
    mongoose.connection.transaction(async (session) => {
      const previous = await AdminAudit.findOne({ operationId: input.operationId })
        .session(session)
        .lean();
      if (previous) {
        if (
          previous.actorId.toString() !== actorId ||
          JSON.stringify(previous.details.input) !== JSON.stringify(input)
        )
          throw new AppError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Operation ID was used for another adjustment.',
          );
        return { ...previous.details.result, replayed: true };
      }
      const balance = await Inventory.findOneAndUpdate(
        {
          sku: input.sku,
          $expr: {
            $and: [
              { $gte: [{ $add: ['$onHand', input.delta] }, '$reserved'] },
              { $lte: [{ $add: ['$onHand', input.delta] }, 100_000_000] },
            ],
          },
        },
        { $inc: { onHand: input.delta } },
        { session, returnDocument: 'after' },
      ).lean();
      if (!balance)
        throw new AppError(
          409,
          'STOCK_CONFLICT',
          'SKU not found or adjustment would violate reserved stock or stock limits.',
        );
      const result = {
        sku: balance.sku,
        onHand: balance.onHand,
        reserved: balance.reserved,
        available: balance.onHand - balance.reserved,
      };
      await audit(
        actorId,
        'STOCK_ADJUSTED',
        input.sku,
        { input, result },
        session,
        input.operationId,
      );
      return { ...result, replayed: false };
    }, tx);
  try {
    res.json({ data: await apply() });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) res.json({ data: await apply() });
    else throw e;
  }
});
adminRouter.get('/orders', async (req, res) => {
  const { page, limit, q, status, fulfillmentStatus } = pagination
    .extend({
      status: z
        .enum(['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'PAYMENT_REVIEW'])
        .optional(),
      fulfillmentStatus: z
        .enum(['UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
        .optional(),
    })
    .parse(req.query);
  const filter = {
    ...(status ? { status } : {}),
    ...(fulfillmentStatus ? { fulfillmentStatus } : {}),
    ...(q ? { orderId: search(q) } : {}),
  };
  const [rows, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ data: rows.map(orderDto), pagination: pageInfo(page, limit, total) });
});
adminRouter.get('/orders/:id', async (req, res) => {
  const order = await Order.findOne({ orderId: z.uuid().parse(req.params.id) }).lean();
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  res.json({ data: orderDto(order) });
});
adminRouter.put('/orders/:id/fulfillment', async (req, res) => {
  const orderId = z.uuid().parse(req.params.id);
  const input = z
    .object({
      expectedStatus: z.enum(['UNFULFILLED', 'PROCESSING', 'SHIPPED']),
      status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED']),
      carrier: z.string().trim().max(100).default(''),
      trackingNumber: z.string().trim().max(120).default(''),
    })
    .strict()
    .parse(req.body);
  const transitions = { UNFULFILLED: 'PROCESSING', PROCESSING: 'SHIPPED', SHIPPED: 'DELIVERED' };
  if (transitions[input.expectedStatus] !== input.status)
    throw new AppError(409, 'INVALID_TRANSITION', 'Fulfillment must progress one step at a time.');
  if (input.status === 'SHIPPED' && (!input.carrier || !input.trackingNumber))
    throw new AppError(
      400,
      'TRACKING_REQUIRED',
      'Carrier and tracking number are required for shipping.',
    );
  await mongoose.connection.transaction(async (session) => {
    const result = await Order.updateOne(
      {
        orderId,
        status: 'CONFIRMED',
        paymentStatus: 'CAPTURED',
        fulfillmentStatus: input.expectedStatus,
      },
      {
        $set: {
          fulfillmentStatus: input.status,
          ...(input.status === 'SHIPPED'
            ? { carrier: input.carrier, trackingNumber: input.trackingNumber }
            : {}),
        },
      },
      { session },
    );
    if (!result.modifiedCount)
      throw new AppError(
        409,
        'ORDER_STATE_CONFLICT',
        'Order must be paid and confirmed, and its current fulfillment status must match.',
      );
    await audit(res.locals.customer.id, 'FULFILLMENT_UPDATED', orderId, input, session);
  }, tx);
  const order = await Order.findOne({ orderId }).lean();
  res.json({ data: orderDto(order!) });
});
adminRouter.get('/discounts', async (req, res) => {
  const { page, limit, q } = pagination.parse(req.query);
  const filter = q ? { code: search(q) } : {};
  const [rows, total] = await Promise.all([
    Discount.find(filter)
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Discount.countDocuments(filter),
  ]);
  res.json({
    data: rows.map((d) => ({ ...d, id: d._id.toString() })),
    pagination: pageInfo(page, limit, total),
  });
});
adminRouter.post('/discounts', async (req, res) => {
  const input = discountBody.parse(req.body);
  const data = await uniqueWrite(() =>
    mongoose.connection.transaction(async (session) => {
      const [d] = await Discount.create([input], { session });
      await audit(res.locals.customer.id, 'DISCOUNT_CREATED', d!.id, input, session);
      return d!.toObject();
    }, tx),
  );
  res.status(201).json({ data: { ...data, id: data._id.toString() } });
});
adminRouter.put('/discounts/:id', async (req, res) => {
  const discountId = id.parse(req.params.id);
  const { revision, ...input } = discountBody.safeExtend({ revision: integer }).parse(req.body);
  const data = await uniqueWrite(() =>
    mongoose.connection.transaction(async (session) => {
      const before = await Discount.findById(discountId).session(session).lean();
      const d = await Discount.findOneAndUpdate(
        { _id: discountId, revision },
        { $set: input, $inc: { revision: 1 } },
        { session, returnDocument: 'after', runValidators: true },
      ).lean();
      if (!d) throw conflict();
      await audit(
        res.locals.customer.id,
        'DISCOUNT_UPDATED',
        discountId,
        { before, after: input },
        session,
      );
      return d;
    }, tx),
  );
  res.json({ data: { ...data, id: data._id.toString() } });
});
adminRouter.get('/audit', async (req, res) => {
  const { page, limit } = pagination.parse(req.query);
  const [rows, total] = await Promise.all([
    AdminAudit.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-details')
      .lean(),
    AdminAudit.countDocuments(),
  ]);
  res.json({ data: rows, pagination: pageInfo(page, limit, total) });
});
