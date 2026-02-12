/**
 * Organization management and usage API endpoints.
 */

import express from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { getOrganization, getOrganizationId, hashApiKey } from '../middleware/auth.js';
import { getPlanTier, PLAN_TIERS } from '../middleware/planEnforcement.js';
import { getDb } from '../../db/connection.js';
import { organizations, apiKeys, envelopes } from '../../db/schema.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import { logEvent } from '../../audit/auditLogger.js';

const router = express.Router();

// ─── Validation Schemas ─────────────────────────────────────────────

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
  billingEmail: z.string().email().optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
  billingEmail: z.string().email().optional(),
  settings: z.record(z.unknown()).optional(),
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  permissions: z.array(z.string()).optional(),
  expiresInDays: z.number().int().positive().optional(),
});

// ─── Organization Routes ────────────────────────────────────────────

/**
 * POST /api/organizations
 * Create a new organization.
 */
router.post('/', validate(createOrgSchema), async (req, res) => {
  const db = getDb();
  const { name, slug, plan, billingEmail } = req.body;

  // Check slug uniqueness
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({
      success: false,
      error: `Organization slug "${slug}" is already taken`,
    });
    return;
  }

  const planTier = PLAN_TIERS[plan ?? 'free'];

  const [org] = await db
    .insert(organizations)
    .values({
      tenantId: req.tenant!.id,
      name,
      slug,
      plan: plan ?? 'free',
      envelopeLimit: planTier.envelopeLimit,
      billingEmail,
    })
    .returning();

  await logEvent({
    envelopeId: null,
    signerId: null,
    eventType: 'organization_created',
    eventData: { organizationId: org.id, name, slug, plan: plan ?? 'free' },
    actorId: 'admin',
    ipAddress: req.ip ?? '',
  });

  res.status(201).json({
    success: true,
    data: org,
  });
});

/**
 * GET /api/organizations/:id
 * Get organization details.
 */
router.get('/:id', async (req, res) => {
  const db = getDb();
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);

  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found' });
    return;
  }

  const plan = getPlanTier({
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    envelopeLimit: org.envelopeLimit,
    envelopesUsed: org.envelopesUsed,
    settings: (org.settings ?? {}) as Record<string, unknown>,
  });

  res.json({
    success: true,
    data: {
      ...org,
      planDetails: plan,
    },
  });
});

/**
 * PATCH /api/organizations/:id
 * Update an organization.
 */
router.patch('/:id', validate(updateOrgSchema), async (req, res) => {
  const db = getDb();
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const updates: Record<string, unknown> = {};
  if (req.body.name) updates.name = req.body.name;
  if (req.body.billingEmail) updates.billingEmail = req.body.billingEmail;
  if (req.body.settings) updates.settings = req.body.settings;

  // Plan change — update envelope limit
  if (req.body.plan) {
    updates.plan = req.body.plan;
    const planTier = PLAN_TIERS[req.body.plan];
    updates.envelopeLimit = planTier.envelopeLimit;
  }

  const [updated] = await db
    .update(organizations)
    .set(updates)
    .where(eq(organizations.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ success: false, error: 'Organization not found' });
    return;
  }

  await logEvent({
    envelopeId: null,
    signerId: null,
    eventType: 'organization_updated',
    eventData: { organizationId: id, updates: Object.keys(updates) },
    actorId: 'admin',
    ipAddress: req.ip ?? '',
  });

  res.json({ success: true, data: updated });
});

// ─── Usage Endpoint ─────────────────────────────────────────────────

/**
 * GET /api/organizations/usage
 * Get current month's usage for the authenticated organization.
 */
router.get('/usage', async (req, res) => {
  const org = getOrganization(req);

  if (!org) {
    // Single-tenant mode — count all envelopes this month
    const db = getDb();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const result = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(envelopes)
      .where(gte(envelopes.createdAt, startOfMonth));

    res.json({
      success: true,
      data: {
        plan: 'self-hosted',
        envelopesUsed: result[0]?.count ?? 0,
        envelopeLimit: null,
        remaining: null,
        percentUsed: 0,
        resetDate: getNextResetDate(),
      },
    });
    return;
  }

  const plan = getPlanTier(org);
  const remaining = plan.envelopeLimit !== null
    ? Math.max(0, plan.envelopeLimit - org.envelopesUsed)
    : null;
  const percentUsed = plan.envelopeLimit !== null
    ? Math.round((org.envelopesUsed / plan.envelopeLimit) * 100)
    : 0;

  res.json({
    success: true,
    data: {
      organizationId: org.id,
      organizationName: org.name,
      plan: org.plan,
      planName: plan.name,
      envelopesUsed: org.envelopesUsed,
      envelopeLimit: plan.envelopeLimit,
      remaining,
      percentUsed,
      resetDate: getNextResetDate(),
      features: {
        verificationLevels: plan.verificationLevels,
        integrationsEnabled: plan.integrationsEnabled,
        ssoEnabled: plan.ssoEnabled,
        customRetention: plan.customRetention,
        maxSignersPerEnvelope: plan.maxSignersPerEnvelope,
        apiRateLimit: plan.apiRateLimit,
        supportLevel: plan.supportLevel,
      },
    },
  });
});

// ─── API Key Management ─────────────────────────────────────────────

/**
 * POST /api/organizations/:id/api-keys
 * Generate a new API key for an organization.
 */
router.post('/:id/api-keys', validate(createApiKeySchema), async (req, res) => {
  const db = getDb();
  const orgId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Verify organization exists
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found' });
    return;
  }

  // Generate a secure API key
  const rawKey = `sendsign_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = hashApiKey(rawKey);

  const expiresAt = req.body.expiresInDays
    ? new Date(Date.now() + req.body.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      tenantId: req.tenant!.id,
      organizationId: orgId,
      keyHash,
      name: req.body.name ?? null,
      permissions: req.body.permissions ?? ['all'],
      expiresAt,
    })
    .returning();

  await logEvent({
    envelopeId: null,
    signerId: null,
    eventType: 'api_key_created',
    eventData: { organizationId: orgId, keyId: apiKey.id, name: apiKey.name },
    actorId: 'admin',
    ipAddress: req.ip ?? '',
  });

  // IMPORTANT: Return the raw key only once — it's hashed in the database
  res.status(201).json({
    success: true,
    data: {
      id: apiKey.id,
      key: rawKey, // Only shown once!
      name: apiKey.name,
      permissions: apiKey.permissions,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    },
  });
});

/**
 * GET /api/organizations/:id/api-keys
 * List API keys for an organization (hashes not returned).
 */
router.get('/:id/api-keys', async (req, res) => {
  const db = getDb();
  const orgId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      permissions: apiKeys.permissions,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, orgId));

  res.json({ success: true, data: keys });
});

/**
 * DELETE /api/organizations/:id/api-keys/:keyId
 * Revoke an API key.
 */
router.delete('/:id/api-keys/:keyId', async (req, res) => {
  const db = getDb();
  const keyId = Array.isArray(req.params.keyId) ? req.params.keyId[0] : req.params.keyId;

  await db.delete(apiKeys).where(eq(apiKeys.id, keyId));

  await logEvent({
    envelopeId: null,
    signerId: null,
    eventType: 'api_key_revoked',
    eventData: { keyId },
    actorId: 'admin',
    ipAddress: req.ip ?? '',
  });

  res.json({ success: true, data: { revoked: true } });
});

// ─── Plan Tiers Info ────────────────────────────────────────────────

/**
 * GET /api/organizations/plans
 * List available plan tiers and their features.
 */
router.get('/plans', async (req, res) => {
  const plans = Object.entries(PLAN_TIERS).map(([key, plan]) => ({
    id: key,
    ...plan,
  }));

  res.json({ success: true, data: plans });
});

// ─── Helpers ────────────────────────────────────────────────────────

function getNextResetDate(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString();
}

export default router;
