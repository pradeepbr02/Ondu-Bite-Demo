import { AppError } from '../../shared/errors.js';

export function calculateDiscount(
  discount: {
    kind: string;
    value: number;
    minSubtotalPaise: number;
    maxDiscountPaise: number;
    startsAt: Date;
    endsAt: Date;
    active: boolean;
  },
  subtotal: number,
  now = new Date(),
) {
  if (
    !discount.active ||
    now < discount.startsAt ||
    now >= discount.endsAt ||
    subtotal < discount.minSubtotalPaise
  ) {
    throw new AppError(
      409,
      'COUPON_UNAVAILABLE',
      'This coupon is inactive, expired or its minimum spend has not been reached.',
    );
  }
  const amount =
    discount.kind === 'PERCENT' ? Math.floor((subtotal * discount.value) / 100) : discount.value;
  // Keep at least one paise payable; shipping eligibility uses the original subtotal.
  return Math.min(
    subtotal - 1,
    discount.maxDiscountPaise > 0 ? Math.min(amount, discount.maxDiscountPaise) : amount,
  );
}
