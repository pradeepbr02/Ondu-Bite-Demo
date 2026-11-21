export type Category = {
  id: string;
  name: string;
  slug: string;
  kannadaName?: string;
  image?: string;
  imagePresentation?: 'food' | 'package' | 'package-scene';
};
export type Variant = {
  sku: string;
  weightGrams: number;
  pricePaise: number;
  currency: string;
  inStock: boolean;
};
export type Product = {
  id: string;
  name: string;
  slug: string;
  category: string;
  images: string[];
  variants: Variant[];
  kannadaName?: string;
  description?: string;
  ingredients?: string[];
  allergens?: string[];
  imagePresentation?: 'food' | 'package' | 'package-scene';
  imageNote?: string;
};
export type Customer = { id: string; name: string; email: string; role?: 'customer' | 'admin' };
export type CartInput = { sku: string; quantity: number };
export type CartItem = CartInput & {
  name?: string;
  productSlug?: string;
  weightGrams?: number;
  unitPricePaise: number | null;
  lineTotalPaise: number | null;
  available: boolean;
  issue: string | null;
};
export type Cart = {
  revision: number;
  currency: string;
  items: CartItem[];
  subtotalPaise: number | null;
  canCheckout: boolean;
};
export type Address = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  stateCode: string;
  postalCode: string;
  country: string;
};
export type Totals = {
  currency: string;
  subtotalPaise: number;
  discountPaise?: number;
  couponCode?: string;
  shippingPaise: number;
  totalPaise: number;
  pricingMode: string;
};
export type Quote = {
  cartRevision: number;
  address: Omit<Address, 'id'>;
  items: CartItem[];
  totals: Totals;
  quoteFingerprint: string;
  paymentAvailable: boolean;
};
export type Order = {
  orderId: string;
  checkoutId: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  carrier?: string;
  trackingNumber?: string;
  address: Omit<Address, 'id'>;
  items: CartItem[];
  totals: Totals;
  createdAt: string;
};
export type Checkout = {
  checkoutId: string;
  orderId: string;
  status: string;
  expiresAt: string;
  paymentAvailable: boolean;
  order: Order;
};
export const money = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
export const weight = (grams: number) => (grams >= 1000 ? `${grams / 1000} kg` : `${grams} g`);
export const categorySlugs = ['ready-to-eat', 'ready-to-mix', 'coffee', 'snacks'];
export const categoryNames = ['Ready to eat', 'Ready to mix', 'Coffee', 'Snacks'];
