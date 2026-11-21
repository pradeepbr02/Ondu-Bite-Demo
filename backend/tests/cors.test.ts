import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
const app = createApp({ corsOrigin: 'http://localhost:3000', logRequests: false });
describe('frontend CORS contract', () => {
  it('allows the exact frontend origin without credentialed cookies on the bearer API', async () => {
    const result = await request(app)
      .get('/health/live')
      .set('Origin', 'http://localhost:3000')
      .expect(200);
    expect(result.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(result.headers['access-control-allow-credentials']).toBeUndefined();
    expect(result.headers.vary).toContain('Origin');
    expect(result.headers['access-control-expose-headers']).toContain('Idempotency-Replayed');
  });
  it('allows checkout preflight with JSON, Authorization and Idempotency-Key', async () => {
    const result = await request(app)
      .options('/api/v1/checkouts')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization,idempotency-key')
      .expect(204);
    expect(result.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(result.headers['access-control-allow-methods']).toContain('POST');
    const headers = String(result.headers['access-control-allow-headers']).toLowerCase();
    for (const header of ['content-type', 'authorization', 'idempotency-key'])
      expect(headers).toContain(header);
  });
  it('rejects unknown and lookalike origins before reaching routes', async () => {
    for (const origin of [
      'https://evil.example',
      'http://localhost:3000.evil.example',
      'null',
      'http://localhost:3001',
    ]) {
      const result = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', origin)
        .send({})
        .expect(403);
      expect(result.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
      expect(result.headers['access-control-allow-origin']).toBeUndefined();
    }
  });
  it('allows server clients without an Origin and blocks a disallowed preflight', async () => {
    const result = await request(app).get('/health/live').expect(200);
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
    await request(app)
      .options('/api/v1/cart')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'PUT')
      .expect(403);
  });
});
