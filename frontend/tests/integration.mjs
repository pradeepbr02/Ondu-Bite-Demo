import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = 'http://localhost:3000';
async function call(path, { method = 'GET', body, cookie, origin = base, key } = {}) {
  const response = await fetch(`${base}/api/store/${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method !== 'GET' ? { Origin: origin } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = response.status === 204 ? null : await response.json();
  return { response, status: response.status, json, data: json?.data };
}

test('frontend gateway integrates auth, owned addresses, cart, checkout and orders with an isolated database', async () => {
  const sentinel = await call('products?limit=40');
  assert.equal(
    sentinel.response.headers.get('X-Store-Test-Database'),
    'isolated-memory',
    'Refusing writes: frontend must point to the isolated test backend on port 4010.',
  );
  assert.equal(sentinel.data.length, 10);
  assert.equal((await call('cart')).status, 401);
  assert.equal(
    (await call('auth/register', { method: 'POST', origin: 'https://evil.example', body: {} }))
      .status,
    403,
  );
  const email = `${randomUUID()}@example.com`;
  const password = `test-${randomUUID()}`;
  assert.equal(
    (
      await call('auth/register', {
        method: 'POST',
        body: { name: 'Storefront Test', email, password },
      })
    ).status,
    201,
  );
  const signedIn = await call('auth/login', { method: 'POST', body: { email, password } });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.data.email, email);
  assert.equal(
    signedIn.data.accessToken,
    undefined,
    'Raw session token must not enter browser JSON.',
  );
  const setCookie = signedIn.response.headers.get('set-cookie');
  assert.match(setCookie, /httponly/i);
  assert.match(setCookie, /samesite=lax/i);
  const cookie = setCookie.split(';')[0];
  assert.equal((await call('auth/me', { cookie })).data.email, email);
  const address = await call('addresses', {
    cookie,
    method: 'POST',
    body: {
      name: 'Test Only',
      phone: '9876543210',
      line1: '123 Test Street',
      city: 'Chennai',
      stateCode: 'TN',
      postalCode: '600001',
      country: 'IN',
    },
  });
  assert.equal(address.status, 201);
  const cart = await call('cart', {
    cookie,
    method: 'PUT',
    body: { revision: 0, items: [{ sku: 'UPMA-500', quantity: 2 }] },
  });
  assert.equal(cart.status, 200);
  const quote = await call('checkouts/quote', {
    cookie,
    method: 'POST',
    body: { cartRevision: cart.data.revision, addressId: address.data.id },
  });
  assert.equal(quote.status, 200);
  assert.equal(quote.data.totals.shippingPaise, 0);
  const key = randomUUID();
  const body = {
    cartRevision: cart.data.revision,
    addressId: address.data.id,
    quoteFingerprint: quote.data.quoteFingerprint,
  };
  const checkout = await call('checkouts', { cookie, method: 'POST', key, body });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.data.paymentAvailable, false);
  const replay = await call('checkouts', { cookie, method: 'POST', key, body });
  assert.equal(replay.status, 200);
  assert.equal(replay.response.headers.get('Idempotency-Replayed'), 'true');
  assert.equal(replay.data.checkoutId, checkout.data.checkoutId);
  assert.equal(
    (await call('checkouts/active', { cookie })).data.checkoutId,
    checkout.data.checkoutId,
  );
  assert.equal((await call('orders', { cookie })).data.length, 1);
  assert.equal(
    (await call(`orders/${checkout.data.orderId}`, { cookie })).data.paymentStatus,
    'UNPAID',
  );
  assert.equal(
    (await call(`checkouts/${checkout.data.checkoutId}/cancel`, { cookie, method: 'POST' })).data
      .status,
    'CANCELLED',
  );
  assert.equal((await call('checkouts/active', { cookie })).data, null);
  assert.equal((await call('auth/logout', { cookie, method: 'POST' })).status, 204);
  assert.equal((await call('auth/me', { cookie })).status, 401);
});

test('real HTTP CORS accepts the storefront preflight and rejects another origin', async () => {
  const health = await fetch('http://127.0.0.1:4010/__test/identity');
  assert.equal((await health.json()).isolated, true);
  const allowed = await fetch('http://127.0.0.1:4010/api/v1/checkouts', {
    method: 'OPTIONS',
    headers: {
      Origin: base,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization,idempotency-key',
    },
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), base);
  assert.match(allowed.headers.get('access-control-allow-headers'), /Idempotency-Key/i);
  const denied = await fetch('http://127.0.0.1:4010/api/v1/products', {
    headers: { Origin: 'https://evil.example' },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
