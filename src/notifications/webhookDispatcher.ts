import crypto from 'node:crypto';

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  createdAt: Date;
}

// In-memory storage for simplicity — in production, use database
const webhooks = new Map<string, Webhook>();

/**
 * Register a new webhook.
 */
export async function registerWebhook(url: string, events: string[]): Promise<Webhook> {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString('hex');

  const webhook: Webhook = {
    id,
    url,
    events,
    secret,
    createdAt: new Date(),
  };

  webhooks.set(id, webhook);
  return webhook;
}

/**
 * Remove a webhook.
 */
export async function removeWebhook(id: string): Promise<void> {
  webhooks.delete(id);
}

/**
 * List all webhooks.
 */
export async function listWebhooks(): Promise<Webhook[]> {
  return Array.from(webhooks.values());
}

/**
 * Compute HMAC signature for webhook payload.
 */
function computeSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Dispatch an event to all registered webhooks matching the event type.
 */
export async function dispatch(event: string, payload: unknown): Promise<void> {
  const matchingWebhooks = Array.from(webhooks.values()).filter((wh) =>
    wh.events.includes(event) || wh.events.includes('*'),
  );

  if (matchingWebhooks.length === 0) return;

  const payloadStr = JSON.stringify(payload);

  for (const webhook of matchingWebhooks) {
    dispatchToWebhook(webhook, event, payloadStr).catch((error) => {
      console.error(`Webhook dispatch failed for ${webhook.url}:`, error);
    });
  }
}

/**
 * Dispatch to a single webhook with retries.
 */
async function dispatchToWebhook(
  webhook: Webhook,
  event: string,
  payloadStr: string,
): Promise<void> {
  const signature = computeSignature(payloadStr, webhook.secret);
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CoSeal-Event': event,
          'X-CoSeal-Signature': signature,
          'X-CoSeal-Delivery': crypto.randomUUID(),
        },
        body: payloadStr,
      });

      if (response.ok) {
        return; // Success
      }

      throw new Error(`Webhook returned ${response.status}`);
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Verify a webhook signature (for incoming webhook requests).
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = computeSignature(payload, secret);
  
  // Check lengths match before comparing
  if (signature.length !== expectedSignature.length) {
    return false;
  }
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    );
  } catch {
    return false;
  }
}
