import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { catalogRouter } from './modules/catalog/routes.js';
import { AppError } from './shared/errors.js';
import { createIdentityRouter } from './modules/identity/routes.js';
import { cartRouter } from './modules/cart/routes.js';
import { addressRouter } from './modules/addresses/routes.js';
import { createCheckoutRouter } from './modules/checkout/routes.js';
import { orderRouter } from './modules/checkout/order-routes.js';
import { mediaRouter } from './modules/media/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { createAdminUploadRouter } from './modules/admin/uploads.js';
import { createAssistantRouter } from './modules/assistant/routes.js';

export function createApp(options: {
  corsOrigin: string;
  trustProxyHops?: number;
  logRequests?: boolean;
  checkoutEnabled?: boolean;
  gemini?: { apiKey?: string; model: string };
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxyHops ?? 0);
  app.use((_req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    const started = Date.now();
    res.on('finish', () => {
      if (options.logRequests !== false)
        console.log(
          JSON.stringify({
            requestId,
            method: _req.method,
            status: res.statusCode,
            durationMs: Date.now() - started,
          }),
        );
    });
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, false);
        if (origin === new URL(options.corsOrigin).origin) return callback(null, true);
        callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed.'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-Id', 'Idempotency-Replayed', 'Location'],
      maxAge: 600,
    }),
  );
  // No shared caches until public catalog and live availability are separated.
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Try again shortly.',
            requestId: res.locals.requestId,
          },
        }),
    }),
  );
  // Keep the future Razorpay raw-body webhook route BEFORE this JSON parser.
  app.use('/api/v1/admin', createAdminUploadRouter());
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1', catalogRouter);
  app.use('/api/v1', createIdentityRouter());
  app.use('/api/v1/cart', cartRouter);
  app.use('/api/v1/addresses', addressRouter);
  app.use('/api/v1/checkouts', createCheckoutRouter(options.checkoutEnabled ?? true));
  app.use('/api/v1/orders', orderRouter);
  app.use('/api/v1/media', mediaRouter);
  app.use(
    '/api/v1/assistant',
    createAssistantRouter(options.gemini ?? { model: 'gemini-3.1-flash-lite' }),
  );
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Route not found.')));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request.',
          details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          requestId: res.locals.requestId,
        },
      });
      return;
    }
    const parserStatus =
      error?.type === 'entity.parse.failed' ? 400 : error?.type === 'entity.too.large' ? 413 : null;
    const status = error instanceof AppError ? error.status : (parserStatus ?? 500);
    if (status === 500)
      console.error(
        JSON.stringify({
          requestId: res.locals.requestId,
          code: 'INTERNAL_ERROR',
          name: error?.name,
        }),
      );
    res.status(status).json({
      error: {
        code:
          error instanceof AppError ? error.code : parserStatus ? 'INVALID_BODY' : 'INTERNAL_ERROR',
        message:
          error instanceof AppError
            ? error.message
            : parserStatus
              ? 'Invalid request body.'
              : 'An unexpected error occurred.',
        requestId: res.locals.requestId,
      },
    });
  };
  app.use(errorHandler);
  return app;
}
