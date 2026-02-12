/**
 * SCIM 2.0 User Provisioning Endpoints
 * 
 * TODO: Implement full SCIM 2.0 specification when needed.
 * When implemented, all routes should require the 'scim' feature:
 * 
 * import { requireFeature } from '../../control/services/featureGates.js';
 * router.all('/*', requireFeature('scim'));
 */

import { Router } from 'express';

const router = Router();

// Placeholder — SCIM not yet implemented
router.all('/*', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'SCIM provisioning is not yet implemented',
    message: 'This feature is under development. Contact enterprise@sendsign.dev for early access.',
  });
});

export default router;
