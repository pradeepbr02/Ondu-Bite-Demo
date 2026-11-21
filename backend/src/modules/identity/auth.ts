import { createHash, randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import { Customer, Session } from './models.js';
import { AppError } from '../../shared/errors.js';

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueSession(customerId: string) {
  const accessToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await Session.create({ customerId, tokenHash: tokenHash(accessToken), expiresAt });
  return { accessToken, tokenType: 'Bearer', expiresAt };
}

export const requireCustomer: RequestHandler = async (req, res, next) => {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.get('authorization') ?? '');
  if (!match) throw new AppError(401, 'UNAUTHENTICATED', 'A valid session is required.');
  const session = await Session.findOne({
    tokenHash: tokenHash(match[1]!),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'A valid session is required.');
  const customer = await Customer.findOne({ _id: session.customerId, active: true }).lean();
  if (!customer) throw new AppError(401, 'UNAUTHENTICATED', 'A valid session is required.');
  res.locals.customer = {
    id: customer._id.toString(),
    name: customer.name,
    email: customer.email,
    role: customer.role ?? 'customer',
  };
  res.locals.sessionId = session._id.toString();
  next();
};

export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (res.locals.customer?.role !== 'admin')
    throw new AppError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
  next();
};
