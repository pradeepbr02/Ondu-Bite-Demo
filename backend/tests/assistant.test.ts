import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const app = () => createApp({ corsOrigin: 'http://localhost:3000', logRequests: false });
const orderId = '4bc32bc9-b456-42e3-88ca-8f0d4216edec';

afterEach(() => vi.unstubAllGlobals());

describe('store assistant', () => {
  it('answers FAQ shortcuts without Gemini and keeps the orders API private', async () => {
    const store = request(app());
    const shipping = await store.post('/api/v1/assistant/chat').send({ topic: 'shipping' });
    expect(shipping.body.data.message).toContain('₹999');
    const status = await store.post('/api/v1/assistant/chat').send({ topic: 'order' });
    expect(status.body.data).toEqual({ topic: 'order', action: 'order' });
    await store.get(`/api/v1/orders/${orderId}`).expect(401);
  });

  it('passes an order ID to the storefront without sending it to Gemini', async () => {
    const gemini = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({
        candidates: [{ content: { parts: [{ text: '{"topic":"order"}' }] } }],
      }),
    );
    vi.stubGlobal('fetch', gemini);
    const result = await request(
      createApp({
        corsOrigin: 'http://localhost:3000',
        logRequests: false,
        gemini: { apiKey: 'fake-key', model: 'gemini-3.1-flash-lite' },
      }),
    )
      .post('/api/v1/assistant/chat')
      .send({ question: `Has ${orderId} shipped? me@example.com` });
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ topic: 'order', action: 'order', orderId });
    const body = String(gemini.mock.calls[0]?.[1].body);
    expect(body).not.toContain(orderId);
    expect(body).not.toContain('me@example.com');
  });

  it('rejects oversized messages and reports unconfigured free-text support', async () => {
    const store = request(app());
    await store
      .post('/api/v1/assistant/chat')
      .send({ question: 'x'.repeat(501) })
      .expect(400);
    await store.post('/api/v1/assistant/chat').send({ question: 'How much to ship?' }).expect(503);
  });
});
