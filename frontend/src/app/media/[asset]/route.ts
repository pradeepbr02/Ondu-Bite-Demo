import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ asset: string }> }) {
  const { asset } = await context.params;
  if (!['hero', 'categories', 'brand'].includes(asset) && !/^product-[a-f0-9]{24}$/.test(asset))
    return new NextResponse(null, { status: 404 });
  try {
    const base = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';
    const response = await fetch(`${base}/api/v1/media/${asset}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      return new NextResponse(null, {
        status: response.status,
        headers: { 'Cache-Control': 'no-store' },
      });
    const { data } = await response.json();
    const location = new URL(data.url);
    if (location.protocol !== 'https:' || !/^[a-f0-9]{64}$/.test(data.sha256))
      throw new Error('Invalid image location.');
    const etag = `"${data.sha256}"`;
    const headers = {
      'Cache-Control': 'public, max-age=300',
      ETag: etag,
      'X-Image-Source': 'object-storage',
      'X-Content-Type-Options': 'nosniff',
    };
    if (request.headers.get('if-none-match') === etag)
      return new NextResponse(null, { status: 304, headers });
    // Stream from object storage: no filesystem writes and no Next image optimizer.
    // A stable same-origin URL also keeps temporary S3 signatures out of browser URLs.
    const cloud = await fetch(location, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!cloud.ok || cloud.headers.get('content-type') !== 'image/webp')
      throw new Error('Cloud image unavailable.');
    return new NextResponse(cloud.body, { headers: { ...headers, 'Content-Type': 'image/webp' } });
  } catch {
    return new NextResponse(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
