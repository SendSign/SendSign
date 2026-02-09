import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  registerWebhook,
  removeWebhook,
  listWebhooks,
} from '../../notifications/webhookDispatcher.js';

const router = Router();

const registerWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
});

/**
 * POST /api/webhooks
 * Register a new webhook.
 */
router.post('/', validate(registerWebhookSchema), async (req, res) => {
  const webhook = await registerWebhook(req.body.url, req.body.events);

  res.status(201).json({ success: true, data: webhook });
});

/**
 * GET /api/webhooks
 * List all webhooks.
 */
router.get('/', async (req, res) => {
  const webhooks = await listWebhooks();

  res.json({ success: true, data: webhooks });
});

/**
 * DELETE /api/webhooks/:id
 * Remove a webhook.
 */
router.delete('/:id', async (req, res) => {
  await removeWebhook(req.params.id);

  res.json({ success: true, data: { message: 'Webhook removed' } });
});

export default router;
