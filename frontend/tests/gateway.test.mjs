import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedGatewayRoute, allowedMutationOrigin } from '../src/lib/gateway-policy.ts';
test('gateway limits routes and methods instead of acting as an open proxy', () => {
  assert.equal(allowedGatewayRoute('checkouts', 'POST'), true);
  assert.equal(allowedGatewayRoute('auth/login', 'POST'), true);
  for (const path of ['auth/guest', 'auth/phone/send', 'auth/phone/verify']) {
    assert.equal(allowedGatewayRoute(path, 'POST'), true);
    assert.equal(allowedGatewayRoute(path, 'GET'), false);
  }
  for (const path of [
    '../health/live',
    'https://example.com',
    'products/../../auth/login',
    'admin',
    'auth/login/anything',
  ]) {
    assert.equal(allowedGatewayRoute(path, 'POST'), false);
  }
  assert.equal(allowedGatewayRoute('products', 'DELETE'), false);
  assert.equal(allowedGatewayRoute('auth/login', 'GET'), false);
});
test('cookie authenticated mutations require the exact frontend origin', () => {
  assert.equal(
    allowedMutationOrigin('POST', 'http://localhost:3000', 'http://localhost:3000'),
    true,
  );
  for (const origin of [
    null,
    'null',
    'https://evil.example',
    'http://localhost:3000.evil.example',
  ]) {
    assert.equal(allowedMutationOrigin('POST', origin, 'http://localhost:3000'), false);
  }
  assert.equal(allowedMutationOrigin('GET', null, 'http://localhost:3000'), true);
});

test('admin gateway exposes only explicit operations and identifiers', () => {
  for (const [path, method] of [
    ['admin/me', 'GET'],
    ['admin/access', 'PUT'],
    ['admin/products', 'POST'],
    ['admin/products/aaaaaaaaaaaaaaaaaaaaaaaa', 'PUT'],
    ['admin/inventory/adjustments', 'POST'],
    ['admin/images', 'POST'],
    ['admin/discounts', 'GET'],
  ])
    assert.equal(allowedGatewayRoute(path, method), true);
  for (const [path, method] of [
    ['admin/products', 'DELETE'],
    ['admin/users', 'POST'],
    ['admin/role', 'PUT'],
    ['admin/access', 'GET'],
    ['admin/products/../../auth/me', 'GET'],
    ['admin/images', 'GET'],
    ['admin/orders/not-an-id', 'GET'],
  ])
    assert.equal(allowedGatewayRoute(path, method), false);
});
