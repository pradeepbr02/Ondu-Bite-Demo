import { Category, Product, Variant } from '../catalog/models.js';
import { Inventory } from '../inventory/models.js';
import { AppError } from '../../shared/errors.js';
import { Cart } from './models.js';

type Item = { sku: string; quantity: number };

export async function describeItems(items: Item[]) {
  const variants = await Variant.find({
    sku: { $in: items.map((i) => i.sku) },
    active: true,
  }).lean();
  const products = await Product.find({
    _id: { $in: variants.map((v) => v.productId) },
    active: true,
  }).lean();
  const categories = await Category.find({
    _id: { $in: products.map((p) => p.categoryId) },
    active: true,
  }).lean();
  const balances = await Inventory.find({ sku: { $in: items.map((i) => i.sku) } }).lean();

  return items.map((item) => {
    const variant = variants.find((v) => v.sku === item.sku);
    const product = variant && products.find((p) => p._id.equals(variant.productId));
    const category = product && categories.find((c) => c._id.equals(product.categoryId));
    if (!variant || !product || !category) {
      return {
        ...item,
        available: false,
        issue: 'PRODUCT_UNAVAILABLE' as const,
        unitPricePaise: null,
        lineTotalPaise: null,
      };
    }
    const balance = balances.find((b) => b.sku === item.sku);
    const available = !!balance && balance.onHand - balance.reserved >= item.quantity;
    return {
      ...item,
      name: product.name,
      productSlug: product.slug,
      weightGrams: variant.weightGrams,
      unitPricePaise: variant.pricePaise,
      lineTotalPaise: variant.pricePaise * item.quantity,
      available,
      issue: available ? null : ('INSUFFICIENT_STOCK' as const),
    };
  });
}

export async function getCart(customerId: string) {
  const cart = await Cart.findOne({ customerId }).lean();
  const items = await describeItems(cart?.items ?? []);
  const allPricesKnown = items.every((i) => i.lineTotalPaise !== null);
  const subtotalPaise = allPricesKnown
    ? items.reduce((total, i) => total + i.lineTotalPaise!, 0)
    : null;
  if (subtotalPaise !== null && !Number.isSafeInteger(subtotalPaise))
    throw new Error('Cart total exceeds safe integer bounds.');
  return {
    revision: cart?.revision ?? 0,
    currency: 'INR',
    items,
    subtotalPaise,
    canCheckout: items.length > 0 && items.every((i) => i.available),
  };
}

export async function replaceCart(customerId: string, revision: number, items: Item[]) {
  const described = await describeItems(items);
  if (described.some((i) => i.issue === 'PRODUCT_UNAVAILABLE')) {
    throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'One or more products are no longer available.');
  }
  // Revision prevents two tabs/devices from silently overwriting one another.
  try {
    const cart = await Cart.findOneAndUpdate(
      { customerId, revision },
      {
        $set: { items },
        $inc: { revision: 1 },
      },
      { upsert: revision === 0, returnDocument: 'after', runValidators: true },
    );
    if (!cart)
      throw new AppError(409, 'CART_CONFLICT', 'Cart changed. Fetch it again before saving.');
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new AppError(409, 'CART_CONFLICT', 'Cart changed. Fetch it again before saving.');
    }
    throw error;
  }
  return getCart(customerId);
}
