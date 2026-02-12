import { getDb } from '../../db/connection.js';
import { envelopes, users, documents, templates, tenants } from '../../db/schema.js';
import { eq, and, gte, sql, count, ne } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────

export interface TenantUsage {
  tenantId: string;
  period: string; // YYYY-MM
  envelopes: {
    used: number;
    limit: number;
    percentUsed: number;
  };
  users: {
    active: number;
    limit: number;
  };
  templates: {
    count: number;
    limit: number;
  };
  storage: {
    bytesUsed: number;
  };
}

// ─── Usage Queries ──────────────────────────────────────────────────

/**
 * Get the start of the current billing period (1st of current month).
 */
function getBillingPeriodStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Get current period string (YYYY-MM).
 */
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Count envelopes sent (non-draft) this billing period for a tenant.
 */
export async function getEnvelopeCount(tenantId: string): Promise<number> {
  const db = getDb();
  const periodStart = getBillingPeriodStart();

  const [result] = await db
    .select({ count: count() })
    .from(envelopes)
    .where(
      and(
        eq(envelopes.tenantId, tenantId),
        ne(envelopes.status, 'draft'),
        gte(envelopes.createdAt, periodStart),
      ),
    );

  return result?.count ?? 0;
}

/**
 * Count active users for a tenant.
 */
export async function getActiveUserCount(tenantId: string): Promise<number> {
  const db = getDb();

  const [result] = await db
    .select({ count: count() })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
      ),
    );

  return result?.count ?? 0;
}

/**
 * Count templates for a tenant.
 */
export async function getTemplateCount(tenantId: string): Promise<number> {
  const db = getDb();

  const [result] = await db
    .select({ count: count() })
    .from(templates)
    .where(eq(templates.tenantId, tenantId));

  return result?.count ?? 0;
}

/**
 * Estimate storage usage for a tenant (rough — sum of document sizes).
 * In production, use S3 ListObjectsV2 with prefix for accurate counts.
 */
export async function getStorageBytes(tenantId: string): Promise<number> {
  const db = getDb();

  // Estimate: count documents × average PDF size (500KB)
  const [result] = await db
    .select({ count: count() })
    .from(documents)
    .where(eq(documents.tenantId, tenantId));

  const docCount = result?.count ?? 0;
  return docCount * 500 * 1024; // ~500KB per document
}

/**
 * Get full usage summary for a tenant.
 */
export async function getTenantUsage(tenantId: string): Promise<TenantUsage> {
  const db = getDb();

  // Fetch tenant limits
  const [tenant] = await db
    .select({
      envelopeLimit: tenants.envelopeLimit,
      userLimit: tenants.userLimit,
      templateLimit: tenants.templateLimit,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  const [envelopeCount, activeUsers, templateCount, storageBytes] =
    await Promise.all([
      getEnvelopeCount(tenantId),
      getActiveUserCount(tenantId),
      getTemplateCount(tenantId),
      getStorageBytes(tenantId),
    ]);

  const envelopeLimit = tenant.envelopeLimit;
  const percentUsed =
    envelopeLimit <= 0
      ? 0 // unlimited
      : Math.round((envelopeCount / envelopeLimit) * 100);

  return {
    tenantId,
    period: getCurrentPeriod(),
    envelopes: {
      used: envelopeCount,
      limit: envelopeLimit,
      percentUsed,
    },
    users: {
      active: activeUsers,
      limit: tenant.userLimit,
    },
    templates: {
      count: templateCount,
      limit: tenant.templateLimit,
    },
    storage: {
      bytesUsed: storageBytes,
    },
  };
}

/**
 * Check if a tenant is within a specific limit.
 * Returns true if within limits, false if exceeded.
 * A limit of -1 means unlimited.
 */
export async function enforceLimit(
  tenantId: string,
  limitType: 'envelopes' | 'users' | 'templates',
): Promise<boolean> {
  const result = await checkLimit(tenantId, limitType);
  return result.allowed;
}

/**
 * Check if a tenant can perform an action.
 * Returns detailed limit status with helpful error message.
 * A limit of -1 means unlimited.
 */
export async function checkLimit(
  tenantId: string,
  limitType: 'envelopes' | 'users' | 'templates',
): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  message?: string;
}> {
  const db = getDb();

  const [tenant] = await db
    .select({
      slug: tenants.slug,
      plan: tenants.plan,
      envelopeLimit: tenants.envelopeLimit,
      userLimit: tenants.userLimit,
      templateLimit: tenants.templateLimit,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    return {
      allowed: false,
      current: 0,
      limit: 0,
      message: 'Tenant not found',
    };
  }

  let current = 0;
  let limit = 0;
  let resourceName = '';

  switch (limitType) {
    case 'envelopes': {
      limit = tenant.envelopeLimit;
      current = await getEnvelopeCount(tenantId);
      resourceName = 'envelopes';
      break;
    }
    case 'users': {
      limit = tenant.userLimit;
      current = await getActiveUserCount(tenantId);
      resourceName = 'users';
      break;
    }
    case 'templates': {
      limit = tenant.templateLimit;
      current = await getTemplateCount(tenantId);
      resourceName = 'templates';
      break;
    }
  }

  // Unlimited (-1)
  if (limit === -1) {
    return {
      allowed: true,
      current,
      limit: -1,
    };
  }

  // Check if limit exceeded
  if (current >= limit) {
    const baseDomain = process.env.SENDSIGN_BASE_DOMAIN || 'sendsign.dev';
    return {
      allowed: false,
      current,
      limit,
      message: `${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)} limit reached (${current}/${limit} on ${tenant.plan} plan). Upgrade at https://${tenant.slug}.${baseDomain}/admin/billing`,
    };
  }

  return {
    allowed: true,
    current,
    limit,
  };
}
