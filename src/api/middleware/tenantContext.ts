import type { Request, Response, NextFunction } from 'express';
import { sql, eq } from 'drizzle-orm';
import { getDb } from '../../db/connection.js';
import { getOrganization, type AuthenticatedRequest } from './auth.js';
import { tenants, organizations } from '../../db/schema.js';
import type { Tenant } from '../../db/schema.js';

/**
 * Extended request with tenant context.
 */
export interface TenantRequest extends AuthenticatedRequest {
  tenant?: Tenant;
  tenantId?: string;
}

/**
 * Tenant context middleware.
 * 
 * Sets the PostgreSQL session variable `app.tenant_id` for Row-Level Security (RLS).
 * This ensures that all database queries are automatically filtered to the current tenant.
 * 
 * CRITICAL: This middleware MUST run after the `authenticate` middleware,
 * which populates req.organization and req.user.
 * 
 * Flow:
 * 1. Extract organization from authenticated request
 * 2. Load full tenant record
 * 3. Check tenant status (suspended/canceled)
 * 4. Set `app.tenant_id` session variable for RLS
 * 5. Attach tenant to request
 * 
 * Routes that are exempted:
 * - Public signing ceremony routes (/sign/:token, /api/sign/:token)
 * - Health check routes
 * - Static assets
 */
export async function tenantContext(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const db = getDb();

  // Skip tenant context for public routes
  if (shouldSkipTenantContext(req)) {
    return next();
  }

  try {
    // Extract organization from authenticated request
    const org = getOrganization(req);

    if (!org) {
      // If no organization, we're in single-tenant mode or unauthenticated
      // Use the default tenant for backwards compatibility
      const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
      
      await db.execute(sql.raw(`SET LOCAL app.tenant_id = '${DEFAULT_TENANT_ID}'`));
      (req as TenantRequest).tenantId = DEFAULT_TENANT_ID;
      
      return next();
    }

    // Look up full tenant record from organization using Drizzle query builder
    const orgRecord = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, org.id))
      .limit(1);

    if (!orgRecord || orgRecord.length === 0) {
      res.status(403).json({
        success: false,
        error: 'Organization not found',
      });
      return;
    }

    const tenantRecords = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, orgRecord[0].tenantId))
      .limit(1);

    if (!tenantRecords || tenantRecords.length === 0) {
      res.status(403).json({
        success: false,
        error: 'Tenant not found',
      });
      return;
    }

    const tenantRecord = tenantRecords[0];

    // Check tenant status
    if (tenantRecord.status === 'suspended') {
      res.status(403).json({
        success: false,
        error: 'Account suspended. Please contact support.',
      });
      return;
    }

    if (tenantRecord.status === 'canceled') {
      res.status(403).json({
        success: false,
        error: 'Account has been canceled.',
      });
      return;
    }

    // Set RLS context for this database connection
    // Using SET LOCAL ensures the variable is transaction-scoped
    await db.execute(sql.raw(`SET LOCAL app.tenant_id = '${tenantRecord.id}'`));

    // Attach tenant to request for use in route handlers
    (req as TenantRequest).tenant = tenantRecord;
    (req as TenantRequest).tenantId = tenantRecord.id;

    next();
  } catch (error) {
    console.error('Tenant context error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to establish tenant context',
    });
  }
}

/**
 * Determine if tenant context should be skipped for this request.
 */
function shouldSkipTenantContext(req: Request): boolean {
  const path = req.path;

  // Public signing ceremony routes
  if (path.startsWith('/sign/') || path.startsWith('/api/sign/')) {
    return true;
  }

  // Health check and status routes
  if (path === '/health' || path === '/api/health' || path === '/status') {
    return true;
  }

  // Static assets
  if (
    path.startsWith('/assets/') ||
    path.startsWith('/public/') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.svg') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg')
  ) {
    return true;
  }

  // Control plane routes (if you have admin/superadmin routes)
  if (path.startsWith('/control/') || path.startsWith('/api/control/')) {
    return true;
  }

  return false;
}

/**
 * Get the tenant ID from the request.
 */
export function getTenantId(req: Request): string | null {
  return (req as TenantRequest).tenantId ?? null;
}

/**
 * Get the full tenant record from the request.
 */
export function getTenant(req: Request): Tenant | null {
  return (req as TenantRequest).tenant ?? null;
}
