import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Customer, Session } from './models.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { issueSession, requireCustomer } from './auth.js';
import { AppError } from '../../shared/errors.js';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(12).max(128);
const registerBody = z.object({ name: z.string().trim().min(1).max(80), email, password }).strict();
const loginBody = z.object({ email, password: z.string().min(1).max(128) }).strict();

// Router factory keeps rate-limit state isolated between app instances.
export function createIdentityRouter() {
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
        customer: {
          id: customer._id.toString(),
          name: customer.name,
          email: customer.email,
          role: customer.role ?? 'customer',
        },
      },
    });
  });

  router.get('/auth/me', requireCustomer, (_req, res) => res.json({ data: res.locals.customer }));
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
