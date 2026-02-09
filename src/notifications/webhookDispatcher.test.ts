import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerWebhook,
  removeWebhook,
  listWebhooks,
  verifyWebhookSignature,
} from './webhookDispatcher.js';
import crypto from 'node:crypto';

describe('webhookDispatcher', () => {
  beforeEach(async () => {
    // Clear all webhooks
    const all = await listWebhooks();
    for (const wh of all) {
      await removeWebhook(wh.id);
    }
  });

  it('registers a webhook', async () => {
    const webhook = await registerWebhook('https://example.com/webhook', ['envelope.signed']);

    expect(webhook.id).toBeTruthy();
    expect(webhook.url).toBe('https://example.com/webhook');
    expect(webhook.events).toEqual(['envelope.signed']);
    expect(webhook.secret).toBeTruthy();
  });

  it('lists webhooks', async () => {
    await registerWebhook('https://example.com/wh1', ['*']);
    await registerWebhook('https://example.com/wh2', ['envelope.completed']);

    const list = await listWebhooks();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('removes a webhook', async () => {
    const wh = await registerWebhook('https://example.com/wh', ['*']);
    await removeWebhook(wh.id);

    const list = await listWebhooks();
    expect(list.find((w) => w.id === wh.id)).toBeUndefined();
  });

  it('verifies webhook signature', () => {
    const secret = 'test-secret';
    const payload = JSON.stringify({ event: 'test' });
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(payload, 'invalid', secret)).toBe(false);
  });
});
