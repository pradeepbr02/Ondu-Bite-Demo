import { createHash, randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { ClientSession } from 'mongoose';
import { Customer, Session } from './models.js';
import { AppError } from '../../shared/errors.js';

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function customerProfile(customer: {
  _id: unknown;
  name: string;
  email: string;
  role?: string;
  guest?: boolean;
  contactEmail?: string | null;
  verifiedPhone?: string | null;
}) {
  return {
    id: String(customer._id),
    name: customer.name,
    email: customer.guest
      ? (customer.contactEmail ?? '')
      : customer.verifiedPhone
        ? ''
        : customer.email,
    role: customer.role ?? 'customer',
    ...(customer.guest && { guest: true }),
    ...(customer.verifiedPhone && { phone: customer.verifiedPhone }),
  };
}

export async function issueSession(customerId: string, transaction?: ClientSession) {
  const accessToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await new Session({ customerId, tokenHash: tokenHash(accessToken), expiresAt }).save({
    session: transaction,
  });
  return { accessToken, tokenType: 'Bearer', expiresAt };
}

function authenticate(allowGuest: boolean): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.get('authorization') ?? '');
    if (!match) throw new AppError(401, 'UNAUTHENTICATED', 'A valid session is required.');
    const session = await Session.findOne({
      tokenHash: tokenHash(match[1]!),
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'A valid session is required.');
    const customer = await Customer.findOne({ _id: session.customerId, active: true }).lean();
    if (!customer) throw new AppError(401, 'UNAUTHENTICATED', 'A valid session is required.');
    if (customer.guest && !allowGuest)
      throw new AppError(403, 'ACCOUNT_REQUIRED', 'Sign in with an account to use this feature.');
    res.locals.customer = customerProfile(customer);
    res.locals.sessionId = session._id.toString();
    next();
  };
}

export const requireShopper = authenticate(true);
export const requireCustomer = authenticate(false);

export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (res.locals.customer?.role !== 'admin')
    throw new AppError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
  next();
};
