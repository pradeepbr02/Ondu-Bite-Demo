import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = 'http://localhost:3100';
let cookie;
async function call(path, method = 'GET', body, origin = base) {
  const response = await fetch(`${base}/api/store/${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method !== 'GET' ? { Origin: origin } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    response,
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
}
test('admin gateway integrates sessions, RBAC, product editing, inventory, discounts and CORS', async () => {
  const sentinel = await call('products');
  assert.equal(
    sentinel.response.headers.get('X-Store-Test-Database'),
    'isolated-memory',
    'Refusing writes outside the isolated review server.',
  );
  assert.equal((await call('admin/summary')).status, 401);
  const login = await call('auth/login', 'POST', {
    email: 'admin@example.test',
    password: 'Review-only-password-123',
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.role, 'admin');
  assert.equal(login.body.data.accessToken, undefined);
  cookie = login.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('admin/summary')).status, 200);
  assert.equal((await call('admin/products', 'POST', {}, 'https://evil.example')).status, 403);
  const category = (await call('admin/categories')).body.data[0];
  const suffix = randomUUID().slice(0, 8);
  const input = {
    name: 'Gateway review almonds',
    slug: `gateway-almonds-${suffix}`,
    categoryId: category._id,
    description: 'Isolated end-to-end test',
    active: false,
    images: [],
    ingredients: [],
    allergens: [],
    variants: [
      { sku: `GATEWAY-${suffix.toUpperCase()}`, weightGrams: 250, pricePaise: 10000, active: true },
    ],
  };
  const created = await call('admin/products', 'POST', input);
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  assert.equal(
    (
      await call(`admin/products/${id}`, 'PUT', {
        ...input,
        name: 'Updated review almonds',
        revision: 0,
      })
    ).status,
    200,
  );
  assert.equal((await call(`admin/products/${id}`, 'PUT', { ...input, revision: 0 })).status, 409);
  const adjustment = {
    operationId: randomUUID(),
    sku: input.variants[0].sku,
    delta: 12,
    reason: 'Gateway stock receipt',
  };
  assert.equal(
    (await call('admin/inventory/adjustments', 'POST', adjustment)).body.data.onHand,
    12,
  );
  assert.equal(
    (await call('admin/inventory/adjustments', 'POST', adjustment)).body.data.replayed,
    true,
  );
  const coupon = await call('admin/discounts', 'POST', {
    code: `TEST-${suffix}`,
    kind: 'FIXED',
    value: 1000,
    minSubtotalPaise: 10000,
    maxDiscountPaise: 0,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    active: true,
  });
  assert.equal(coupon.status, 201);
  const preflight = await fetch('http://127.0.0.1:4015/api/v1/admin/products', {
    method: 'OPTIONS',
    headers: {
      Origin: base,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), base);
  assert.equal(
    (
      await fetch('http://127.0.0.1:4015/api/v1/admin/products', {
        headers: { Origin: 'https://evil.example' },
      })
    ).status,
    403,
  );
  assert.equal((await call('admin/audit')).status, 200);
  await call('auth/logout', 'POST');
  assert.equal((await call('admin/summary')).status, 401);
});
