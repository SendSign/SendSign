/**
 * Integration management API endpoints.
 */

import express from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireFeature } from '../middleware/planEnforcement.js';
import { integrationRegistry } from '../../integrations/registry.js';
import { logEvent } from '../../audit/auditLogger.js';

const router = express.Router();

// Integrations require at least Pro plan
router.use(requireFeature('integrationsEnabled'));

// ─── Validation Schemas ─────────────────────────────────────────────

const enableIntegrationSchema = z.object({
  config: z.record(z.string()),
});

// ─── Routes ─────────────────────────────────────────────────────────

/**
 * GET /api/integrations
 * List all available integrations and their enabled status.
 */
router.get('/', async (req, res) => {
  const integrations = await integrationRegistry.listAvailable();

  res.json({
    success: true,
    data: integrations,
  });
});

/**
 * POST /api/integrations/:name
 * Enable an integration with configuration.
 */
router.post('/:name', validate(enableIntegrationSchema), async (req, res) => {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  const { config } = req.body;

  try {
    await integrationRegistry.enable(name, config);

    await logEvent({
      envelopeId: null,
      signerId: null,
      eventType: 'integration_enabled',
      eventData: { integration: name },
      actorId: 'admin',
      ipAddress: req.ip ?? '',
    });

    res.json({
      success: true,
      data: { integration: name, enabled: true },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/integrations/:name
 * Disable an integration.
 */
router.delete('/:name', async (req, res) => {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;

  try {
    await integrationRegistry.disable(name);

    await logEvent({
      envelopeId: null,
      signerId: null,
      eventType: 'integration_disabled',
      eventData: { integration: name },
      actorId: 'admin',
      ipAddress: req.ip ?? '',
    });

    res.json({
      success: true,
      data: { integration: name, enabled: false },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/integrations/:name/test
 * Test an integration connection.
 */
router.post('/:name/test', async (req, res) => {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;

  try {
    const result = await integrationRegistry.test(name);

    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
