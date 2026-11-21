import { createHash } from 'node:crypto';
import { readConfig } from '../config.js';
import { assetNames } from '../modules/media/config.js';

async function main() {
  const config = readConfig();
  const frontend = new URL(config.CORS_ORIGIN).origin;
  for (const name of assetNames) {
    const response = await fetch(`http://127.0.0.1:${config.PORT}/api/v1/media/${name}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Manifest unavailable.');
    const { data } = await response.json();
    const cloud = await fetch(`${frontend}/media/${name}`, { signal: AbortSignal.timeout(30000) });
    if (cloud.headers.get('x-image-source') !== 'object-storage')
      throw new Error('Image source is not object storage.');
    if (!cloud.ok || cloud.headers.get('content-type') !== 'image/webp')
      throw new Error('Cloud image unavailable.');
    const bytes = new Uint8Array(await cloud.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== data.sha256)
      throw new Error('Cloud image checksum mismatch.');
    const revalidate = await fetch(`${frontend}/media/${name}`, {
      headers: { 'If-None-Match': cloud.headers.get('etag')! },
      signal: AbortSignal.timeout(10000),
    });
    if (revalidate.status !== 304) throw new Error('Image revalidation failed.');
    console.log(
      JSON.stringify({
        asset: name,
        status: cloud.status,
        source: 'object-storage',
        bytes: bytes.length,
        verified: true,
      }),
    );
  }
}
main().catch(() => {
  console.error(
    'Cloud image delivery check failed. Check running servers and storage configuration.',
  );
  process.exitCode = 1;
});
