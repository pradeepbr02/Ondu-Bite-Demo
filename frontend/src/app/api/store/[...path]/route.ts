import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { allowedGatewayRoute, allowedMutationOrigin } from '@/lib/gateway-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const production = process.env.NODE_ENV === 'production';
const cookieName = production ? '__Host-pantry_session' : 'pantry_session';
const origin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const backend = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/' };
function error(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const path = segments.join('/');
  if (!allowedGatewayRoute(path, request.method))
    return error(404, 'NOT_FOUND', 'Route not found.');
  if (!allowedMutationOrigin(request.method, request.headers.get('origin'), origin))
    return error(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  const publicRoute =
    /^(categories|products)(\/|$)/.test(path) ||
    ['auth/login', 'auth/register', 'assistant/chat'].includes(path);
  if (!publicRoute && !token) return error(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  const upstream = new URL(`/api/v1/${segments.map(encodeURIComponent).join('/')}`, backend);
  upstream.search = request.nextUrl.search;
  const headers: Record<string, string> = { Origin: new URL(origin).origin };
  if (token && !publicRoute) headers.Authorization = `Bearer ${token}`;
  const key = request.headers.get('Idempotency-Key');
  if (key) headers['Idempotency-Key'] = key;
  let body: string | Uint8Array<ArrayBuffer> | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const image = path === 'admin/images';
    const limit = image ? 8 * 1024 * 1024 : 32768;
    if (Number(request.headers.get('content-length') ?? 0) > limit)
      return error(413, 'INVALID_BODY', 'Request is too large.');
    if (
      image &&
      !['image/jpeg', 'image/png', 'image/webp'].includes(request.headers.get('content-type') ?? '')
    )
      return error(400, 'INVALID_IMAGE', 'Choose a JPEG, PNG or WebP image.');
    // Bound streamed bodies too; Content-Length is not trusted.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader)
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > limit) {
          await reader.cancel();
          return error(413, 'INVALID_BODY', 'Request is too large.');
        }
        chunks.push(chunk.value);
      }
    const bytes = Buffer.concat(chunks);
    body = image ? new Uint8Array(bytes) : bytes.toString('utf8');
    if (length)
      headers['Content-Type'] = image ? request.headers.get('content-type')! : 'application/json';
  }
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: body || undefined,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(path === 'admin/images' ? 45000 : 15000),
    });
    const data = response.status === 204 ? null : await response.json();
    const output = path === 'auth/login' && response.ok ? { data: data.data.customer } : data;
    const result = new NextResponse(output === null ? null : JSON.stringify(output), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
    for (const name of [
      'X-Request-Id',
      'Idempotency-Replayed',
      'Retry-After',
      'X-Store-Test-Database',
    ]) {
      const value = response.headers.get(name);
      if (value) result.headers.set(name, value);
    }
    if (path === 'auth/login' && response.ok) {
      result.cookies.set(cookieName, data.data.accessToken, {
        ...cookieOptions,
        expires: new Date(data.data.expiresAt),
      });
    }
    if (
      response.status === 401 ||
      (['auth/logout', 'auth/logout-all'].includes(path) && response.ok)
    ) {
      result.cookies.set(cookieName, '', { ...cookieOptions, maxAge: 0 });
    }
    return result;
  } catch {
    return error(
      502,
      'BACKEND_UNAVAILABLE',
      'Our store is taking a little longer. Please try again.',
    );
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
