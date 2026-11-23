import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Customer, Session } from './models.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { customerProfile, issueSession, requireCustomer, requireShopper } from './auth.js';
import { AppError } from '../../shared/errors.js';
import { addressBody } from '../addresses/routes.js';
import { Address } from '../addresses/models.js';
import { cartBody } from '../cart/routes.js';
import { Cart } from '../cart/models.js';
import { indiaPhone, verifyBySms } from './phone-verification.js';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))
  .refine((value) => !value.endsWith('@guest.invalid') && !value.endsWith('@phone.invalid'));
const password = z.string().min(12).max(128);
const registerBody = z.object({ name: z.string().trim().min(1).max(80), email, password }).strict();
const loginBody = z.object({ email, password: z.string().min(1).max(128) }).strict();
const guestBody = z
  .object({
    email,
    address: addressBody,
    items: cartBody.shape.items.refine((items) => items.length > 0, 'Add something to your bag.'),
  })
  .strict();
const phoneBody = z.object({ phone: indiaPhone }).strict();
const codeBody = phoneBody.extend({ code: z.string().regex(/^\d{4}$/) });

// Router factory keeps rate-limit state isolated between app instances.
export function createIdentityRouter(checkoutEnabled = true) {
  const router = Router();
  const credentialLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: 'AUTH_RATE_LIMITED',
          message: 'Too many authentication attempts. Try again later.',
          requestId: res.locals.requestId,
        },
      }),
  });
  const limitByPhone = (windowMs: number, limit: number) =>
    rateLimit({
      windowMs,
      limit,
      keyGenerator: (req) => indiaPhone.parse(req.body?.phone),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) =>
        res
          .status(429)
          .json({ error: { code: 'OTP_RATE_LIMITED', message: 'Wait before trying again.' } }),
    });

  router.post('/auth/guest', credentialLimiter, async (req, res) => {
    if (!checkoutEnabled)
      throw new AppError(503, 'CHECKOUT_NOT_READY', 'Guest checkout is currently unavailable.');
    const input = guestBody.parse(req.body);
    const result = await mongoose.connection.transaction(async (session) => {
      const shopper = await new Customer({
        name: input.address.name,
        email: `${randomUUID()}@guest.invalid`,
        contactEmail: input.email,
        guest: true,
        passwordHash: 'disabled',
      }).save({ session });
      await new Address({ ...input.address, customerId: shopper._id }).save({ session });
      await new Cart({ customerId: shopper._id, items: input.items, revision: 1 }).save({
        session,
      });
      return { ...(await issueSession(shopper.id, session)), customer: customerProfile(shopper) };
    });
    res.status(201).json({ data: result });
  });

  router.post('/auth/phone/send', credentialLimiter, limitByPhone(30_000, 1), async (req, res) => {
    const { phone } = phoneBody.parse(req.body);
    await verifyBySms(phone);
    res.status(204).end();
  });
  router.post(
    '/auth/phone/verify',
    credentialLimiter,
    limitByPhone(10 * 60_000, 5),
    async (req, res) => {
      const { phone, code } = codeBody.parse(req.body);
      await verifyBySms(phone, code);
      const identity = { email: `${phone.slice(1)}@phone.invalid` };
      const customer = await Customer.findOneAndUpdate(
        identity,
        { $setOnInsert: { name: 'Shopper', verifiedPhone: phone, passwordHash: 'disabled' } },
        { upsert: true, returnDocument: 'after' },
      ).catch(async (error: unknown) => {
        if ((error as { code?: number }).code !== 11000) throw error;
        return Customer.findOne(identity);
      });
      if (
        !customer?.active ||
        customer.verifiedPhone !== phone ||
        customer.guest ||
        customer.role === 'admin'
      )
        throw new AppError(
          403,
          'PHONE_ACCOUNT_UNAVAILABLE',
          'This account cannot sign in by phone.',
        );
      const session = await issueSession(customer.id);
      res.json({ data: { ...session, customer: customerProfile(customer) } });
    },
  );

  router.post('/auth/register', credentialLimiter, async (req, res) => {
    const input = registerBody.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    try {
      const customer = await Customer.create({
        name: input.name,
        email: input.email,
        passwordHash,
      });
      // Registration does not issue a session: login can be safely retried if its response is lost.
      res.status(201).json({
        data: { id: customer._id.toString(), name: customer.name, email: customer.email },
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
      }
      throw error;
    }
  });

  router.post('/auth/login', credentialLimiter, async (req, res) => {
    const input = loginBody.parse(req.body);
    const customer = await Customer.findOne({ email: input.email }).select('+passwordHash');
    const correct = await verifyPassword(input.password, customer?.passwordHash);
    if (!customer || !correct || !customer.active) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const session = await issueSession(customer._id.toString());
    res.json({
      data: {
        ...session,
        customer: customerProfile(customer),
      },
    });
  });

  router.get('/auth/me', requireShopper, (_req, res) => res.json({ data: res.locals.customer }));
  router.post('/auth/logout', requireCustomer, async (_req, res) => {
    await Session.deleteOne({ _id: res.locals.sessionId });
    res.status(204).end();
  });
  router.post('/auth/logout-all', requireCustomer, async (_req, res) => {
    await Session.deleteMany({ customerId: res.locals.customer.id });
    res.status(204).end();
  });
  return router;
}
