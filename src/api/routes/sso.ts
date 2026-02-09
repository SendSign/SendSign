/**
 * SSO management API endpoints.
 */

import express from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireFeature } from '../middleware/planEnforcement.js';
import {
  getSSOConfig,
  upsertSSOConfig,
  deleteSSOConfig,
  getSSOProvider,
  detectOrganizationFromEmail,
} from '../../auth/ssoConfig.js';
import { logEvent } from '../../audit/auditLogger.js';

const router = express.Router();

// SSO configuration requires Enterprise plan (detect endpoint is open)
router.post('/configurations', requireFeature('ssoEnabled'));
router.put('/configurations/:orgId', requireFeature('ssoEnabled'));
router.delete('/configurations/:orgId', requireFeature('ssoEnabled'));

// ─── Validation Schemas ─────────────────────────────────────────────

const createSSOConfigSchema = z.object({
  organizationId: z.string().min(1),
  providerType: z.enum(['saml', 'oidc']),
  config: z.object({
    // SAML config
    entryPoint: z.string().url().optional(),
    issuer: z.string().optional(),
    callbackUrl: z.string().url().optional(),
    cert: z.string().optional(),
    privateKey: z.string().optional(),
    // OIDC config
    issuerUrl: z.string().url().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    // Common
    allowedDomains: z.array(z.string()).optional(),
  }),
  enabled: z.boolean().optional(),
});

// ─── Routes ─────────────────────────────────────────────────────────

/**
 * POST /api/sso/configurations
 * Create or update SSO configuration for an organization.
 */
router.post(
  '/configurations',
  validate(createSSOConfigSchema),
  async (req, res) => {
    const { organizationId, providerType, config, enabled } = req.body;

    const ssoConfig = await upsertSSOConfig(
      organizationId,
      providerType,
      config,
      enabled ?? true,
    );

    await logEvent({
      envelopeId: null,
      signerId: null,
      eventType: 'sso_config_updated',
      eventData: { organizationId, providerType },
      actorId: 'admin',
      ipAddress: req.ip ?? '',
    });

    res.json({
      success: true,
      data: {
        id: ssoConfig.id,
        organizationId: ssoConfig.organizationId,
        providerType: ssoConfig.providerType,
        enabled: ssoConfig.enabled,
        createdAt: ssoConfig.createdAt,
        updatedAt: ssoConfig.updatedAt,
      },
    });
  },
);

/**
 * GET /api/sso/configurations/:orgId
 * Get SSO configuration for an organization.
 */
router.get('/configurations/:orgId', async (req, res) => {
  const orgId = Array.isArray(req.params.orgId) ? req.params.orgId[0] : req.params.orgId;

  const config = await getSSOConfig(orgId);

  if (!config) {
    res.status(404).json({
      success: false,
      error: 'SSO configuration not found',
    });
    return;
  }

  res.json({
    success: true,
    data: {
      id: config.id,
      organizationId: config.organizationId,
      providerType: config.providerType,
      enabled: config.enabled,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      // Don't return sensitive config details (certs, secrets) in GET response
      config: {
        allowedDomains: (config.config as Record<string, unknown>).allowedDomains,
      },
    },
  });
});

/**
 * DELETE /api/sso/configurations/:orgId
 * Delete SSO configuration.
 */
router.delete('/configurations/:orgId', async (req, res) => {
  const orgId = Array.isArray(req.params.orgId) ? req.params.orgId[0] : req.params.orgId;

  await deleteSSOConfig(orgId);

  await logEvent({
    envelopeId: null,
    signerId: null,
    eventType: 'sso_config_deleted',
    eventData: { organizationId: orgId },
    actorId: 'admin',
    ipAddress: req.ip ?? '',
  });

  res.json({ success: true, data: { deleted: true } });
});

/**
 * GET /api/sso/metadata/:orgId
 * Get SP metadata XML for SAML configuration (for IdP setup).
 */
router.get('/metadata/:orgId', async (req, res) => {
  const orgId = Array.isArray(req.params.orgId) ? req.params.orgId[0] : req.params.orgId;

  const provider = await getSSOProvider(orgId);

  if (!provider) {
    res.status(404).json({
      success: false,
      error: 'SSO not configured for this organization',
    });
    return;
  }

  if (provider.type !== 'saml' || !provider.getMetadata) {
    res.status(400).json({
      success: false,
      error: 'Metadata is only available for SAML providers',
    });
    return;
  }

  const metadata = provider.getMetadata();
  res.set('Content-Type', 'application/xml');
  res.send(metadata);
});

/**
 * GET /api/sso/login/:orgId
 * Initiate SSO login for an organization.
 */
router.get('/login/:orgId', async (req, res) => {
  const orgId = Array.isArray(req.params.orgId) ? req.params.orgId[0] : req.params.orgId;
  const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : '/';

  const provider = await getSSOProvider(orgId);

  if (!provider) {
    res.status(404).json({
      success: false,
      error: 'SSO not configured for this organization',
    });
    return;
  }

  try {
    const loginUrl = await provider.initiateLogin(returnUrl);
    res.redirect(loginUrl);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      error: `SSO login initiation failed: ${err.message}`,
    });
  }
});

/**
 * POST /api/sso/callback
 * SAML assertion consumer service or OIDC callback.
 */
router.post('/callback', async (req, res) => {
  const { SAMLResponse, code, state } = req.body;

  // Determine provider type from the request
  let orgId: string | undefined;

  if (SAMLResponse) {
    // SAML callback - need to extract orgId from RelayState or session
    // For simplicity, we'll require it as a query param or in the state
    orgId = typeof req.query.orgId === 'string' ? req.query.orgId : undefined;
  } else if (code) {
    // OIDC callback - orgId might be in state
    orgId = state;
  }

  if (!orgId) {
    res.status(400).json({
      success: false,
      error: 'Organization ID not provided in SSO callback',
    });
    return;
  }

  const provider = await getSSOProvider(orgId);

  if (!provider) {
    res.status(404).json({
      success: false,
      error: 'SSO not configured',
    });
    return;
  }

  try {
    let user;

    if (provider.type === 'saml') {
      user = await provider.handleCallback(SAMLResponse);
    } else {
      user = await provider.handleCallback({ code, state });
    }

    // Log successful SSO login
    await logEvent({
      envelopeId: null,
      signerId: null,
      eventType: 'sso_login_success',
      eventData: { email: user.email, organizationId: user.organizationId },
      actorId: user.email,
      ipAddress: req.ip ?? '',
    });

    // In production, set a session cookie or JWT token here
    // For now, return user info
    res.json({
      success: true,
      data: {
        user: {
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
        },
      },
    });
  } catch (error: unknown) {
    const err = error as Error;

    await logEvent({
      envelopeId: null,
      signerId: null,
      eventType: 'sso_login_failed',
      eventData: { error: err.message, organizationId: orgId },
      actorId: 'unknown',
      ipAddress: req.ip ?? '',
    });

    res.status(401).json({
      success: false,
      error: `SSO authentication failed: ${err.message}`,
    });
  }
});

/**
 * GET /api/sso/detect
 * Detect if SSO is available for an email address.
 */
router.get('/detect', async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email : '';

  if (!email) {
    res.status(400).json({
      success: false,
      error: 'Email parameter required',
    });
    return;
  }

  const orgId = await detectOrganizationFromEmail(email);

  if (!orgId) {
    res.json({
      success: true,
      data: { ssoAvailable: false },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      ssoAvailable: true,
      organizationId: orgId,
      loginUrl: `/api/sso/login/${orgId}`,
    },
  });
});

export default router;
