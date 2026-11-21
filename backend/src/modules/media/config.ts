import { z } from 'zod';

const schema = z.object({
  AWS_REGION: z.string().min(1),
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  S3_PREFIX: z
    .string()
    .regex(/^[a-zA-Z0-9/_-]*$/)
    .default('ondu-bite/'),
  MEDIA_PUBLIC_BASE_URL: z.url().startsWith('https://').optional(),
});
export function mediaConfig() {
  const result = schema.safeParse(process.env);
  if (!result.success) throw new Error('Image storage is not configured.');
  const prefix = result.data.S3_PREFIX.replace(/^\/+|\/+$/g, '');
  return { ...result.data, prefix: prefix ? `${prefix}/` : '' };
}
export const assetNames = ['hero', 'categories', 'brand'] as const;
export type AssetName = (typeof assetNames)[number];
