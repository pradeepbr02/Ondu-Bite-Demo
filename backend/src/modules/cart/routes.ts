import { Router } from 'express';
import { z } from 'zod';
import { requireCustomer } from '../identity/auth.js';
import { getCart, replaceCart } from './service.js';

const cartBody = z
  .object({
    revision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    items: z
      .array(
        z
          .object({
            sku: z
              .string()
              .min(1)
              .max(80)
              .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .max(20)
      .refine(
        (items) => new Set(items.map((i) => i.sku)).size === items.length,
        'Each SKU must appear once.',
      ),
  })
  .strict();

export const cartRouter = Router();
cartRouter.use(requireCustomer);
cartRouter.get('/', async (_req, res) => res.json({ data: await getCart(res.locals.customer.id) }));
cartRouter.put('/', async (req, res) => {
  const input = cartBody.parse(req.body);
  res.json({ data: await replaceCart(res.locals.customer.id, input.revision, input.items) });
});
