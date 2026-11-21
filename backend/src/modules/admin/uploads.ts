import { createHash } from 'node:crypto';
import { Router, raw } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { requireCustomer, requireAdmin } from '../identity/auth.js';
import { mediaConfig } from '../media/config.js';
import { MediaAsset } from '../media/models.js';
import { AdminAudit } from './models.js';
import { AppError } from '../../shared/errors.js';

export function createAdminUploadRouter() {
  const router = Router();
  router.post(
    '/images',
    requireCustomer,
    requireAdmin,
    rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }),
    raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        throw new AppError(400, 'INVALID_IMAGE', 'Upload a JPEG, PNG or WebP image, up to 8 MB.');
      let body: Buffer;
      try {
        body = await sharp(req.body, { limitInputPixels: 20_000_000 })
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        throw new AppError(
          400,
          'INVALID_IMAGE',
          'Image could not be decoded or exceeds the pixel limit.',
        );
      }
      let config: ReturnType<typeof mediaConfig>;
      try {
        config = mediaConfig();
      } catch {
        throw new AppError(503, 'MEDIA_NOT_CONFIGURED', 'Image storage is not configured.');
      }
      const sha256 = createHash('sha256').update(body).digest('hex');
      const name = `product-${sha256.slice(0, 24)}`;
      const key = `${config.prefix}storefront/${name}.webp`;
      const client = new S3Client({ region: config.AWS_REGION });
      try {
        try {
          await client.send(
            new PutObjectCommand({
              Bucket: config.S3_BUCKET,
              Key: key,
              Body: body,
              ContentType: 'image/webp',
              CacheControl: 'public, max-age=31536000, immutable',
              Metadata: { sha256 },
              IfNoneMatch: '*',
            }),
          );
        } catch (e) {
          if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412)
            throw e;
        }
        await mongoose.connection.transaction(async (session) => {
          await MediaAsset.updateOne(
            { name },
            { $setOnInsert: { key, sha256, byteLength: body.length, contentType: 'image/webp' } },
            { upsert: true, session, runValidators: true },
          );
          await AdminAudit.create(
            [
              {
                actorId: res.locals.customer.id,
                action: 'IMAGE_UPLOADED',
                target: name,
                details: { sha256, bytes: body.length },
              },
            ],
            { session },
          );
        });
      } finally {
        client.destroy();
      }
      res.status(201).json({ data: { path: `/media/${name}` } });
    },
  );
  return router;
}
