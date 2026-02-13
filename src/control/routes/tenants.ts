import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import { tenants, envelopes, users } from '../../db/schema.js';
import { eq, count, sql, gte, and, ne, desc } from 'drizzle-orm';
import {
  provisionTenant,
  changePlan,
} from '../services/provisioningService.js';
import { getPlanDefaults } from '../services/planConfig.js';
import { getTenantUsage } from '../services/usageMeter.js';
import { getTenantFeatures } from '../services/featureGates.js';

const router = Router();

// ─── Zod Schemas ────────────────────────────────────────────────────

const slugPattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(slugPattern, 'Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen'),
  plan: z.enum(['free', 'pro', 'business', 'enterprise', 'pro', 'whitelabel']).default('free'),
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(255),
  trialDays: z.number().int().min(0).max(90).optional(),
});

const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  plan: z.enum(['free', 'pro', 'business', 'enterprise', 'pro', 'whitelabel']).optional(),
  status: z.enum(['active', 'trialing', 'past_due', 'canceled', 'suspended']).optional(),
  envelopeLimit: z.number().int().optional(),
  userLimit: z.number().int().optional(),
  templateLimit: z.number().int().optional(),
  bulkSendLimit: z.number().int().optional(),
  auditRetentionDays: z.number().int().optional(),
  features: z.record(z.unknown()).optional(),
  brandingConfig: z.record(z.unknown()).optional(),
  ssoConfig: z.record(z.unknown()).optional(),
});

// ─── POST /tenants — Create a new tenant ────────────────────────────

router.post('/tenants', async (req, res) => {
  // Validate input
  const parsed = createTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { name, slug, plan, adminEmail, adminName, trialDays } = parsed.data;

  try {
    // provisionTenant now handles slug validation and uniqueness checking
    const result = await provisionTenant({
      name,
      slug,
      plan,
      adminEmail,
      adminName,
      trialDays,
    });

    res.status(201).json({
      success: true,
      data: {
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          slug: result.tenant.slug,
          plan: result.tenant.plan,
          status: result.tenant.status,
          envelopeLimit: result.tenant.envelopeLimit,
          userLimit: result.tenant.userLimit,
          templateLimit: result.tenant.templateLimit,
          createdAt: result.tenant.createdAt,
          trialEndsAt: result.tenant.trialEndsAt,
        },
        admin: {
          id: result.admin.id,
          email: result.admin.email,
          name: result.admin.name,
          role: result.admin.role,
          apiKey: result.admin.apiKey, // Only returned once!
        },
        dashboardUrl: result.dashboardUrl,
        apiBaseUrl: result.apiBaseUrl,
      },
    });
  } catch (error) {
    console.error('Failed to provision tenant:', error);
    const message = error instanceof Error ? error.message : 'Failed to provision tenant';

    // Return appropriate status code
    if (message.includes('already taken')) {
      return res.status(409).json({ success: false, error: message });
    }
    if (message.includes('Slug') || message.includes('reserved')) {
      return res.status(400).json({ success: false, error: message });
    }

    res.status(500).json({ success: false, error: message });
  }
});

// ─── GET /tenants — List all tenants ────────────────────────────────

router.get('/tenants', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const db = getDb();

  try {
    // Total count
    const [totalResult] = await db
      .select({ count: count() })
      .from(tenants);
    const total = totalResult?.count ?? 0;

    // Fetch tenants
    const tenantList = await db
      .select()
      .from(tenants)
      .orderBy(desc(tenants.createdAt))
      .limit(limit)
      .offset(offset);

    // Enrich with basic usage (envelope count this month)
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const enriched = await Promise.all(
      tenantList.map(async (t) => {
        const [envCount] = await db
          .select({ count: count() })
          .from(envelopes)
          .where(
            and(
              eq(envelopes.tenantId, t.id),
              ne(envelopes.status, 'draft'),
              gte(envelopes.createdAt, periodStart),
            ),
          );

        const [userCount] = await db
          .select({ count: count() })
          .from(users)
          .where(
            and(
              eq(users.tenantId, t.id),
              eq(users.isActive, true),
            ),
          );

        return {
          ...t,
          usage: {
            envelopesThisMonth: envCount?.count ?? 0,
            activeUsers: userCount?.count ?? 0,
          },
        };
      }),
    );

    res.json({
      success: true,
      data: {
        tenants: enriched,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Failed to list tenants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list tenants',
    });
  }
});

// ─── GET /tenants/:id — Get single tenant with usage ────────────────

router.get('/tenants/:id', async (req, res) => {
  const db = getDb();
  const tenantId = req.params.id;

  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found',
      });
    }

    // Get usage stats
    const usage = await getTenantUsage(tenantId);

    // Get available features based on plan
    const features = getTenantFeatures(tenant.plan);

    res.json({
      success: true,
      data: {
        tenant: {
          ...tenant,
          features, // Include feature availability
        },
        usage,
      },
    });
  } catch (error) {
    console.error('Failed to get tenant:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tenant details',
    });
  }
});

// ─── PUT /tenants/:id — Update tenant ───────────────────────────────

router.put('/tenants/:id', async (req, res) => {
  const parsed = updateTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const db = getDb();
  const tenantId = req.params.id;

  // Verify tenant exists
  const [existing] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Tenant not found',
    });
  }

  try {
    const updates: Record<string, unknown> = {};

    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.envelopeLimit !== undefined) updates.envelopeLimit = parsed.data.envelopeLimit;
    if (parsed.data.userLimit !== undefined) updates.userLimit = parsed.data.userLimit;
    if (parsed.data.templateLimit !== undefined) updates.templateLimit = parsed.data.templateLimit;
    if (parsed.data.bulkSendLimit !== undefined) updates.bulkSendLimit = parsed.data.bulkSendLimit;
    if (parsed.data.auditRetentionDays !== undefined) updates.auditRetentionDays = parsed.data.auditRetentionDays;
    if (parsed.data.features !== undefined) updates.features = parsed.data.features;
    if (parsed.data.brandingConfig !== undefined) updates.brandingConfig = parsed.data.brandingConfig;
    if (parsed.data.ssoConfig !== undefined) updates.ssoConfig = parsed.data.ssoConfig;

    // If plan is changing, use changePlan service
    if (parsed.data.plan !== undefined && parsed.data.plan !== existing.plan) {
      const updated = await changePlan(tenantId, parsed.data.plan);

      // Apply any other explicit updates on top of plan defaults
      if (Object.keys(updates).length > 0) {
        const [finalUpdated] = await db
          .update(tenants)
          .set(updates)
          .where(eq(tenants.id, tenantId))
          .returning();
        return res.json({ success: true, data: finalUpdated });
      }

      return res.json({ success: true, data: updated });
    }

    // No plan change, just apply explicit updates
    if (Object.keys(updates).length === 0) {
      return res.json({ success: true, data: existing });
    }

    const [updated] = await db
      .update(tenants)
      .set(updates)
      .where(eq(tenants.id, tenantId))
      .returning();

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Failed to update tenant:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update tenant',
    });
  }
});

// ─── DELETE /tenants/:id — Soft delete ──────────────────────────────

router.delete('/tenants/:id', async (req, res) => {
  const db = getDb();
  const tenantId = req.params.id;

  const [existing] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Tenant not found',
    });
  }

  try {
    const [updated] = await db
      .update(tenants)
      .set({
        status: 'canceled',
        canceledAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    res.json({
      success: true,
      data: updated,
      message: 'Tenant canceled. Data retained for 90 days.',
    });
  } catch (error) {
    console.error('Failed to cancel tenant:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel tenant',
    });
  }
});

// ─── POST /tenants/:id/suspend — Suspend tenant ────────────────────

router.post('/tenants/:id/suspend', async (req, res) => {
  const db = getDb();
  const tenantId = req.params.id;

  const [existing] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Tenant not found',
    });
  }

  if (existing.status === 'suspended') {
    return res.status(409).json({
      success: false,
      error: 'Tenant is already suspended',
    });
  }

  try {
    const [updated] = await db
      .update(tenants)
      .set({ status: 'suspended' })
      .where(eq(tenants.id, tenantId))
      .returning();

    res.json({
      success: true,
      data: updated,
      message: 'Tenant suspended. All API calls will return 403.',
    });
  } catch (error) {
    console.error('Failed to suspend tenant:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to suspend tenant',
    });
  }
});

// ─── POST /tenants/:id/activate — Reactivate tenant ────────────────

router.post('/tenants/:id/activate', async (req, res) => {
  const db = getDb();
  const tenantId = req.params.id;

  const [existing] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Tenant not found',
    });
  }

  const reactivatable = ['suspended', 'canceled', 'past_due'];
  if (!reactivatable.includes(existing.status)) {
    return res.status(409).json({
      success: false,
      error: `Cannot activate tenant with status '${existing.status}'. Must be suspended, canceled, or past_due.`,
    });
  }

  try {
    const [updated] = await db
      .update(tenants)
      .set({
        status: 'active',
        canceledAt: null,
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    res.json({
      success: true,
      data: updated,
      message: 'Tenant reactivated.',
    });
  } catch (error) {
    console.error('Failed to activate tenant:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate tenant',
    });
  }
});

// ─── GET /tenants/:id/usage — Detailed usage ───────────────────────

router.get('/tenants/:id/usage', async (req, res) => {
  const db = getDb();
  const tenantId = req.params.id;

  // Verify tenant exists
  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Tenant not found',
    });
  }

  try {
    const usage = await getTenantUsage(tenantId);
    res.json({ success: true, data: usage });
  } catch (error) {
    console.error('Failed to get usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tenant usage',
    });
  }
});

export default router;
