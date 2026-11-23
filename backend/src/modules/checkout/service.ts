import { createHash, randomUUID } from 'node:crypto';
import mongoose, { type ClientSession } from 'mongoose';
import { Address } from '../addresses/models.js';
import { Cart } from '../cart/models.js';
import { Category, Product, Variant } from '../catalog/models.js';
import { Inventory } from '../inventory/models.js';
import {
  releaseExpiredReservations,
  releaseReservationInSession,
  reserveStockInSession,
} from '../inventory/service.js';
import { AppError } from '../../shared/errors.js';
import { Checkout, Order } from './models.js';
import { Discount } from '../admin/models.js';
import { calculateDiscount } from '../admin/discounts.js';
import { Customer } from '../identity/models.js';

export const demoShippingPolicy = { shippingFeePaise: 5900, freeShippingFromPaise: 99900 };
type Policy = typeof demoShippingPolicy;
type QuoteInput = { cartRevision: number; addressId: string; couponCode?: string };
type CreateInput = QuoteInput & { quoteFingerprint: string };
const transactionOptions = {
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function buildQuote(
  customerId: string,
  input: QuoteInput,
  session: ClientSession,
  policy: Policy,
) {
  const address = await Address.findOne({ _id: input.addressId, customerId })
    .session(session)
    .lean();
  if (!address) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  const cart = await Cart.findOne({ customerId }).session(session).lean();
  if (!cart || !cart.items.length)
    throw new AppError(409, 'EMPTY_CART', 'Add items to your cart first.');
  if (cart.revision !== input.cartRevision)
    throw new AppError(409, 'CART_CONFLICT', 'Cart changed. Fetch it again.');
  const variants = await Variant.find({ sku: { $in: cart.items.map((i) => i.sku) }, active: true })
    .session(session)
    .lean();
  const products = await Product.find({
    _id: { $in: variants.map((v) => v.productId) },
    active: true,
  })
    .session(session)
    .lean();
  const categories = await Category.find({
    _id: { $in: products.map((p) => p.categoryId) },
    active: true,
  })
    .session(session)
    .lean();
  const items = [...cart.items]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((item) => {
      const variant = variants.find((v) => v.sku === item.sku);
      const product = variant && products.find((p) => p._id.equals(variant.productId));
      if (!variant || !product || !categories.some((c) => c._id.equals(product.categoryId))) {
        throw new AppError(
          409,
          'PRODUCT_UNAVAILABLE',
          'One or more products are no longer available.',
        );
      }
      return {
        sku: item.sku,
        quantity: item.quantity,
        name: product.name,
        productSlug: product.slug,
        weightGrams: variant.weightGrams,
        unitPricePaise: variant.pricePaise,
        lineTotalPaise: variant.pricePaise * item.quantity,
      };
    });
  const subtotalPaise = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  const shippingPaise = subtotalPaise >= policy.freeShippingFromPaise ? 0 : policy.shippingFeePaise;
  let discountPaise = 0;
  if (input.couponCode) {
    const discount = await Discount.findOne({ code: input.couponCode }).session(session).lean();
    if (!discount)
      throw new AppError(409, 'COUPON_UNAVAILABLE', 'Coupon not found or unavailable.');
    discountPaise = calculateDiscount(discount, subtotalPaise);
  }
  const totalPaise = subtotalPaise - discountPaise + shippingPaise;
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 1)
    throw new Error('Invalid checkout total.');
  const totals = {
    currency: 'INR' as const,
    subtotalPaise,
    discountPaise,
    couponCode: input.couponCode ?? '',
    shippingPaise,
    totalPaise,
    pricingMode: 'DEMO' as const,
    policyVersion: `demo-v1-${policy.shippingFeePaise}-${policy.freeShippingFromPaise}`,
  };
  const snapshot = {
    name: address.name,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    stateCode: address.stateCode,
    postalCode: address.postalCode,
    country: address.country,
  };
  const quoteFingerprint = hash({
    customerId,
    cartRevision: input.cartRevision,
    address: snapshot,
    items,
    totals,
  });
  return {
    cartRevision: input.cartRevision,
    address: snapshot,
    items,
    totals,
    quoteFingerprint,
    paymentAvailable: false,
    serviceability: 'UNVERIFIED' as const,
  };
}

export async function quoteCheckout(
  customerId: string,
  input: QuoteInput,
  policy = demoShippingPolicy,
) {
  return mongoose.connection.transaction(async (session) => {
    const quote = await buildQuote(customerId, input, session, policy);
    // Advisory only. Creation checks stock again with conditional writes.
    for (const item of quote.items) {
      const balance = await Inventory.findOne({ sku: item.sku }).session(session).lean();
      if (!balance || balance.onHand - balance.reserved < item.quantity) {
        throw new AppError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${item.sku}.`);
      }
    }
    return quote;
  }, transactionOptions);
}

async function markClosed(
  checkoutId: string,
  reason: 'EXPIRED' | 'CANCELLED',
  session: ClientSession,
) {
  await Checkout.updateOne(
    { checkoutId, status: { $in: ['PREPARING', 'PAYMENT_PENDING'] } },
    { $set: { status: reason } },
    { session },
  );
  await Order.updateOne(
    { checkoutId, status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID' },
    { $set: { status: reason, fulfillmentStatus: 'CANCELLED' } },
    { session },
  );
}

async function closeHold(
  checkoutId: string,
  reason: 'EXPIRED' | 'CANCELLED',
  session: ClientSession,
  now: Date,
) {
  const released = await releaseReservationInSession(checkoutId, reason, session, now);
  if (!released)
    throw new AppError(
      409,
      'CHECKOUT_STATE_CONFLICT',
      'Checkout cannot be closed in its current state.',
    );
  await markClosed(checkoutId, reason, session);
}

export async function expireCheckoutHolds(now = new Date()) {
  return releaseExpiredReservations(now, 100, (checkoutId, session) =>
    markClosed(checkoutId, 'EXPIRED', session),
  );
}

export async function createCheckout(
  customerId: string,
  idempotencyKey: string,
  input: CreateInput,
  policy = demoShippingPolicy,
) {
  const requestFingerprint = hash(input);
  const checkoutId = randomUUID();
  const orderId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60_000);
  let replayed = false;
  try {
    const result = await mongoose.connection.transaction(async (session) => {
      const existing = await Checkout.findOne({ customerId, idempotencyKey }).session(session);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint)
          throw new AppError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was used for a different request.',
          );
        if (
          ['PREPARING', 'PAYMENT_PENDING'].includes(existing.status) &&
          existing.expiresAt <= now
        ) {
          await closeHold(existing.checkoutId, 'EXPIRED', session, now);
        }
        replayed = true;
        return existing.checkoutId;
      }
      const active = await Checkout.findOne({
        customerId,
        status: { $in: ['PREPARING', 'PAYMENT_PENDING'] },
      }).session(session);
      if (active) {
        if (active.expiresAt > now)
          throw new AppError(
            409,
            'ACTIVE_CHECKOUT_EXISTS',
            'Resume or cancel your active checkout before starting another.',
          );
        await closeHold(active.checkoutId, 'EXPIRED', session, now);
      }
      const quote = await buildQuote(customerId, input, session, policy);
      if (quote.quoteFingerprint !== input.quoteFingerprint)
        throw new AppError(409, 'QUOTE_CHANGED', 'Prices or address changed. Request a new quote.');
      // Write the cart revision to fence concurrent edits after our snapshot read.
      const claimed = await Cart.updateOne(
        { customerId, revision: input.cartRevision },
        { $inc: { revision: 1 } },
        { session },
      );
      if (!claimed.modifiedCount)
        throw new AppError(409, 'CART_CONFLICT', 'Cart changed. Request a new quote.');
      await Checkout.create(
        [
          {
            checkoutId,
            orderId,
            customerId,
            idempotencyKey,
            requestFingerprint,
            cartRevision: input.cartRevision,
            expiresAt,
          },
        ],
        { session },
      );
      const guest = await Customer.findOne({ _id: customerId, guest: true })
        .select('contactEmail')
        .session(session)
        .lean();
      await Order.create(
        [
          {
            orderId,
            checkoutId,
            customerId,
            contactEmail: guest?.contactEmail,
            address: quote.address,
            items: quote.items,
            totals: quote.totals,
          },
        ],
        { session },
      );
      await reserveStockInSession(
        {
          checkoutId,
          ownerId: customerId,
          items: quote.items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
        },
        session,
        expiresAt,
      );
      return checkoutId;
    }, transactionOptions);
    return { checkout: await getCheckout(customerId, result), replayed };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const existing = await Checkout.findOne({ customerId, idempotencyKey }).lean();
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint)
          throw new AppError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was used for a different request.',
          );
        return { checkout: await getCheckout(customerId, existing.checkoutId), replayed: true };
      }
      throw new AppError(
        409,
        'ACTIVE_CHECKOUT_EXISTS',
        'Resume or cancel your active checkout before starting another.',
      );
    }
    throw error;
  }
}

export async function getCheckout(customerId: string, checkoutId: string) {
  return mongoose.connection.transaction(async (session) => {
    const checkout = await Checkout.findOne({ customerId, checkoutId }).session(session).lean();
    if (!checkout) throw new AppError(404, 'CHECKOUT_NOT_FOUND', 'Checkout not found.');
    const now = new Date();
    if (['PREPARING', 'PAYMENT_PENDING'].includes(checkout.status) && checkout.expiresAt <= now) {
      await closeHold(checkoutId, 'EXPIRED', session, now);
      checkout.status = 'EXPIRED';
    }
    const order = await loadOrderRecord(customerId, checkoutId, session);
    if (!order) throw new Error('Checkout/order invariant violation.');
    return {
      checkoutId,
      orderId: checkout.orderId,
      status: checkout.status,
      expiresAt: checkout.expiresAt,
      paymentAvailable: false,
      serviceability: 'UNVERIFIED',
      order: orderDto(order),
    };
  }, transactionOptions);
}

export async function cancelCheckout(customerId: string, checkoutId: string) {
  await mongoose.connection.transaction(async (session) => {
    const checkout = await Checkout.findOne({ customerId, checkoutId }).session(session).lean();
    if (!checkout) throw new AppError(404, 'CHECKOUT_NOT_FOUND', 'Checkout not found.');
    if (checkout.status === 'CANCELLED' || checkout.status === 'EXPIRED') return;
    if (!['PREPARING', 'PAYMENT_PENDING'].includes(checkout.status))
      throw new AppError(409, 'CHECKOUT_STATE_CONFLICT', 'Checkout cannot be cancelled.');
    const now = new Date();
    await closeHold(checkoutId, checkout.expiresAt <= now ? 'EXPIRED' : 'CANCELLED', session, now);
  }, transactionOptions);
  return getCheckout(customerId, checkoutId);
}

export async function getActiveCheckout(customerId: string) {
  const checkout = await Checkout.findOne({
    customerId,
    status: { $in: ['PREPARING', 'PAYMENT_PENDING'] },
  }).lean();
  if (!checkout) return null;
  const dto = await getCheckout(customerId, checkout.checkoutId);
  return ['PREPARING', 'PAYMENT_PENDING'].includes(dto.status) ? dto : null;
}

function loadOrderRecord(customerId: string, checkoutId: string, session: ClientSession) {
  return Order.findOne({ customerId, checkoutId }).session(session).lean().exec();
}

export function orderDto(order: NonNullable<Awaited<ReturnType<typeof loadOrderRecord>>>) {
  return {
    orderId: order.orderId,
    checkoutId: order.checkoutId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    carrier: order.carrier ?? '',
    trackingNumber: order.trackingNumber ?? '',
    ...(order.contactEmail && { contactEmail: order.contactEmail }),
    address: order.address,
    items: order.items,
    totals: order.totals,
    createdAt: order.createdAt,
  };
}
