/**
 * Embedded Signing Routes
 * 
 * TODO: Implement iframe-embeddable signing ceremony.
 * When implemented, all routes should require the 'embedded_signing' feature:
 * 
 * import { requireFeature } from '../../control/services/featureGates.js';
 * router.all('/*', requireFeature('embedded_signing'));
 */

import { Router } from 'express';

const router = Router();

// Placeholder — Embedded signing not yet implemented
router.all('/*', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Embedded signing is not yet implemented',
    message: 'This feature is under development. Contact enterprise@sendsign.dev for early access.',
  });
});

export default router;
