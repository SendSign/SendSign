import { Router } from 'express';

const router = Router();

/**
 * POST /control/webhooks/stripe
 *
 * Legacy stub — Stripe webhooks are now handled by:
 *   POST /api/billing/webhook
 *
 * This route is kept for backwards compatibility and redirects
 * to the real webhook endpoint.
 */
router.post('/webhooks/stripe', (req, res) => {
  console.log('[billing] Legacy /control/webhooks/stripe hit — use POST /api/billing/webhook instead');
  res.status(301).json({
    received: false,
    message: 'Stripe webhooks moved to POST /api/billing/webhook. Update your Stripe dashboard.',
  });
});

export default router;
