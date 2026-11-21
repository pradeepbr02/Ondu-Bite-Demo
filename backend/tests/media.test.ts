import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MediaAsset } from '../src/modules/media/models.js';
import { imageLocation } from '../src/modules/media/service.js';
import { mediaConfig } from '../src/modules/media/config.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi
    .fn()
    .mockResolvedValue('https://example.s3.amazonaws.com/image.webp?test-signature=temporary'),
}));
vi.mock('../src/modules/media/models.js', () => ({ MediaAsset: { findOne: vi.fn() } }));
const asset = {
  name: 'hero',
  key: 'ondu-bite/storefront/hero-abc.webp',
  sha256: 'a'.repeat(64),
  contentType: 'image/webp',
  byteLength: 1234,
};
beforeEach(() => {
  vi.stubEnv('AWS_REGION', 'us-east-1');
  vi.stubEnv('S3_BUCKET', 'ecom-ondu-bite');
  vi.stubEnv('S3_PREFIX', 'ondu-bite/');
  vi.stubEnv('MEDIA_PUBLIC_BASE_URL', undefined);
  vi.mocked(MediaAsset.findOne).mockReturnValue({ lean: () => Promise.resolve(asset) } as never);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('cloud-only image locations', () => {
  it('signs only the registered object for a 15-minute read window', async () => {
    const result = await imageLocation('hero');
    expect(result).toMatchObject({
      byteLength: 1234,
      sha256: asset.sha256,
      contentType: 'image/webp',
    });
    expect(vi.mocked(getSignedUrl).mock.calls[0]![1].input).toMatchObject({
      Bucket: 'ecom-ondu-bite',
      Key: asset.key,
    });
    expect(vi.mocked(getSignedUrl).mock.calls[0]![2]).toEqual({ expiresIn: 900 });
  });
  it('can switch to a stable CDN without moving the stored object', async () => {
    vi.stubEnv('MEDIA_PUBLIC_BASE_URL', 'https://images.example.com/');
    expect((await imageLocation('hero')).url).toBe(`https://images.example.com/${asset.key}`);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
  it('does not sign arbitrary private bucket objects outside the storefront prefix', async () => {
    vi.mocked(MediaAsset.findOne).mockReturnValue({
      lean: () => Promise.resolve({ ...asset, key: 'private/customer-file.webp' }),
    } as never);
    await expect(imageLocation('hero')).rejects.toThrow('Invalid image object key.');
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
  it('has no local fallback when a cloud asset is missing', async () => {
    vi.mocked(MediaAsset.findOne).mockReturnValue({ lean: () => Promise.resolve(null) } as never);
    await expect(imageLocation('hero')).rejects.toMatchObject({
      status: 404,
      code: 'IMAGE_NOT_FOUND',
    });
  });
  it('normalizes prefixes and reports missing storage configuration safely', async () => {
    vi.stubEnv('S3_PREFIX', '/ondu-bite///');
    expect(mediaConfig().prefix).toBe('ondu-bite/');
    vi.stubEnv('S3_PREFIX', '');
    expect(mediaConfig().prefix).toBe('');
    vi.stubEnv('S3_BUCKET', undefined);
    await expect(imageLocation('hero')).rejects.toMatchObject({
      status: 503,
      code: 'MEDIA_NOT_CONFIGURED',
    });
  });
});
