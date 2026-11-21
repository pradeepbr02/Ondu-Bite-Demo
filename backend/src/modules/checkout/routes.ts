import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireCustomer } from '../identity/auth.js';
import { AppError } from '../../shared/errors.js';
import {
  cancelCheckout,
  createCheckout,
  getActiveCheckout,
  getCheckout,
  quoteCheckout,
} from './service.js';

const uuid = z.string().uuid();
const quoteBody = z
  .object({
    cartRevision: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER - 1),
    addressId: z
      .string()
      .regex(/^[a-fA-F0-9]{24}$/)
      .transform((v) => v.toLowerCase()),
    couponCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,30}$/)
      .optional(),
  })
  .strict();
const checkoutBody = quoteBody
  .extend({ quoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();

export function createCheckoutRouter(enabled: boolean) {
  const router = Router();
  router.use(requireCustomer);
  const requireDemoCheckout: RequestHandler = (_req, _res, next) => {
    if (!enabled)
      throw new AppError(503, 'CHECKOUT_NOT_READY', 'Checkout is not enabled for live purchases.');
    next();
  };
  router.post('/quote', requireDemoCheckout, async (req, res) => {
    res.json({ data: await quoteCheckout(res.locals.customer.id, quoteBody.parse(req.body)) });
  });
  router.post('/', requireDemoCheckout, async (req, res) => {
    const input = checkoutBody.parse(req.body);
    const key = uuid.parse(req.get('Idempotency-Key'));
    const result = await createCheckout(res.locals.customer.id, key, input);
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    res.location(`/api/v1/checkouts/${result.checkout.checkoutId}`);
    res.status(result.replayed ? 200 : 201).json({ data: result.checkout });
  });
  router.get('/active', async (_req, res) =>
    res.json({ data: await getActiveCheckout(res.locals.customer.id) }),
  );
  router.get('/:id', async (req, res) =>
    res.json({ data: await getCheckout(res.locals.customer.id, uuid.parse(req.params.id)) }),
  );
  router.post('/:id/cancel', async (req, res) =>
    res.json({ data: await cancelCheckout(res.locals.customer.id, uuid.parse(req.params.id)) }),
  );
  return router;
}
