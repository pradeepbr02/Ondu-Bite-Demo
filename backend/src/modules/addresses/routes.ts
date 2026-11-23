import { Router } from 'express';
import { z } from 'zod';
import { requireShopper } from '../identity/auth.js';
import { Address } from './models.js';
import { AppError } from '../../shared/errors.js';

export const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
export const addressBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    phone: z
      .string()
      .regex(/^(?:\+91)?[6-9]\d{9}$/)
      .transform((v) => (v.startsWith('+91') ? v : `+91${v}`)),
    line1: z.string().trim().min(3).max(160),
    line2: z.string().trim().max(160).default(''),
    city: z.string().trim().min(2).max(80),
    stateCode: z.enum([
      'AP',
      'AR',
      'AS',
      'BR',
      'CG',
      'GA',
      'GJ',
      'HR',
      'HP',
      'JH',
      'KA',
      'KL',
      'MP',
      'MH',
      'MN',
      'ML',
      'MZ',
      'NL',
      'OD',
      'PB',
      'RJ',
      'SK',
      'TN',
      'TS',
      'TR',
      'UP',
      'UK',
      'WB',
      'AN',
      'CH',
      'DN',
      'DL',
      'JK',
      'LA',
      'LD',
      'PY',
    ]),
    postalCode: z.string().regex(/^[1-9]\d{5}$/),
    country: z.literal('IN').default('IN'),
  })
  .strict();

function dto(a: {
  _id: unknown;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  stateCode: string;
  postalCode: string;
  country: string;
}) {
  return {
    id: String(a._id),
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    stateCode: a.stateCode,
    postalCode: a.postalCode,
    country: a.country,
  };
}

export const addressRouter = Router();
addressRouter.use(requireShopper);
addressRouter.get('/', async (_req, res) => {
  const addresses = await Address.find({ customerId: res.locals.customer.id })
    .sort({ _id: 1 })
    .lean();
  res.json({ data: addresses.map(dto) });
});
addressRouter.post('/', async (req, res) => {
  const input = addressBody.parse(req.body);
  const address = await Address.create({ ...input, customerId: res.locals.customer.id });
  res.status(201).json({ data: dto(address) });
});
addressRouter.put('/:id', async (req, res) => {
  const id = objectId.parse(req.params.id);
  const input = addressBody.parse(req.body);
  const address = await Address.findOneAndUpdate(
    { _id: id, customerId: res.locals.customer.id },
    { $set: input },
    { returnDocument: 'after', runValidators: true },
  );
  if (!address) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  res.json({ data: dto(address) });
});
addressRouter.delete('/:id', async (req, res) => {
  const id = objectId.parse(req.params.id);
  const result = await Address.deleteOne({ _id: id, customerId: res.locals.customer.id });
  if (!result.deletedCount) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  res.status(204).end();
});
