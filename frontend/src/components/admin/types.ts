import type { Order } from '@/lib/types';
export type AdminCategory = { _id: string; name: string; active: boolean };
export type AdminVariant = {
  sku: string;
  weightGrams: number;
  pricePaise: number;
  active: boolean;
};
export type AdminProduct = {
  id: string;
  revision: number;
  name: string;
  kannadaName?: string;
  slug: string;
  categoryId: string;
  categoryName?: string;
  description: string;
  active: boolean;
  images: string[];
  imagePresentation?: 'food' | 'package' | 'package-scene';
  imageNote?: string;
  ingredients: string[];
  allergens: string[];
  variants: AdminVariant[];
};
export type Stock = { sku: string; onHand: number; reserved: number; available: number };
export type AdminOrder = Order & { carrier: string; trackingNumber: string };
export type Coupon = {
  id: string;
  revision: number;
  code: string;
  kind: 'PERCENT' | 'FIXED';
  value: number;
  minSubtotalPaise: number;
  maxDiscountPaise: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
};
export type Audit = {
  _id: string;
  action: string;
  target: string;
  actorId: string;
  createdAt: string;
};
