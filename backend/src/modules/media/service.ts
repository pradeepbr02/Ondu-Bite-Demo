import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mediaConfig } from './config.js';
import { MediaAsset } from './models.js';
import { AppError } from '../../shared/errors.js';

export async function imageLocation(name: string) {
  let config: ReturnType<typeof mediaConfig>;
  try {
    config = mediaConfig();
  } catch {
    throw new AppError(503, 'MEDIA_NOT_CONFIGURED', 'Image storage is not configured.');
  }
  const asset = await MediaAsset.findOne({ name }).lean();
  if (!asset) throw new AppError(404, 'IMAGE_NOT_FOUND', 'Image not found.');
  if (!asset.key.startsWith(`${config.prefix}storefront/`) || !asset.key.endsWith('.webp')) {
    throw new Error('Invalid image object key.');
  }
  const client = new S3Client({ region: config.AWS_REGION });
  try {
    const url = config.MEDIA_PUBLIC_BASE_URL
      ? `${config.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')}/${asset.key.split('/').map(encodeURIComponent).join('/')}`
      : await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: asset.key }),
          { expiresIn: 900 },
        );
    return {
      url,
      sha256: asset.sha256,
      contentType: asset.contentType,
      byteLength: asset.byteLength,
    };
  } finally {
    client.destroy();
  }
}
