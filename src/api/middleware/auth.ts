import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/connection.js';
import { organizations, apiKeys, users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { AuthenticatedUser } from './rbac.js';
import { verifyJwt } from '../../auth/authService.js';

/**
 * Organization context attached to authenticated requests.
 */
export interface OrganizationContext {
  id: string;
  name: string;
  slug: string;
  plan: string;
  envelopeLimit: number | null;
  envelopesUsed: number;
  settings: Record<string, unknown>;
  ownerEmail?: string;
}

/**
 * Extended request with organization context.
 */
export interface AuthenticatedRequest extends Request {
  organization?: OrganizationContext;
  authenticated?: boolean;
}

/**
 * Hash an API key for comparison (SHA-256).
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Bearer token authentication middleware.
 * Supports both:
 * 1. Single-tenant mode: API_KEY environment variable
 * 2. Multi-tenant mode: API keys stored in the database per organization
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // Extract token from Authorization header or ?apiKey= query param fallback
  // (the query param is needed for browser-based pages like /prepare/:id
  //  where the client can't set custom headers on the initial page load)
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (typeof req.query.apiKey === 'string' && req.query.apiKey.length > 0) {
    token = req.query.apiKey;
  }

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid Authorization header',
    });
    return;
  }

  // First try single-tenant mode (env var API key)
  const envApiKey = process.env.API_KEY ?? process.env.SENDSIGN_API_KEY;

  if (envApiKey && token === envApiKey) {
    // Single-tenant mode — authenticated without org context
    (req as AuthenticatedRequest).authenticated = true;

    // Resolve user from SENDSIGN_ADMIN_EMAIL or default to admin
    resolveOrCreateUser(req, process.env.SENDSIGN_ADMIN_EMAIL || 'admin@sendsign.local', 'admin')
      .then(() => next())
      .catch(() => next()); // Proceed even if user resolution fails
    return;
  }

  // Try JWT authentication (email/password or SSO login)
  const jwtPayload = verifyJwt(token);
  if (jwtPayload) {
    (req as AuthenticatedRequest).authenticated = true;

    // Resolve user from JWT payload
    resolveOrCreateUser(req, jwtPayload.email, jwtPayload.role as 'admin' | 'sender' | 'viewer', jwtPayload.organizationId || undefined)
      .then(() => next())
      .catch(() => next());
    return;
  }

  // Multi-tenant mode — lookup API key in database
  resolveApiKey(token)
    .then(async (org) => {
      if (!org) {
        res.status(401).json({ success: false, error: 'Unauthorized: Invalid API key' });
        return;
      }

      // Attach organization context to request
      (req as AuthenticatedRequest).organization = org;
      (req as AuthenticatedRequest).authenticated = true;

      // Resolve user for this org (use token owner or default)
      await resolveOrCreateUser(req, org.ownerEmail || 'admin@sendsign.local', 'admin', org.id);

      next();
    })
    .catch((err) => {
      console.error('Auth error:', err);
      res.status(500).json({ success: false, error: 'Authentication service error' });
    });
}

/**
 * Resolve an API key to an organization.
 */
async function resolveApiKey(token: string): Promise<OrganizationContext | null> {
  try {
    const db = getDb();
    const keyHash = hashApiKey(token);

    // Find the API key
    const results = await db
      .select({
        keyId: apiKeys.id,
        expiresAt: apiKeys.expiresAt,
        orgId: organizations.id,
        orgName: organizations.name,
        orgSlug: organizations.slug,
        orgPlan: organizations.plan,
        orgEnvelopeLimit: organizations.envelopeLimit,
        orgEnvelopesUsed: organizations.envelopesUsed,
        orgSettings: organizations.settings,
      })
      .from(apiKeys)
      .innerJoin(organizations, eq(apiKeys.organizationId, organizations.id))
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (results.length === 0) return null;

    const result = results[0];

    // Check if key has expired
    if (result.expiresAt && new Date() > new Date(result.expiresAt)) {
      return null;
    }

    // Update last used timestamp (fire and forget)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, result.keyId))
      .catch(() => {}); // Non-critical

    return {
      id: result.orgId,
      name: result.orgName,
      slug: result.orgSlug,
      plan: result.orgPlan,
      envelopeLimit: result.orgEnvelopeLimit,
      envelopesUsed: result.orgEnvelopesUsed,
      settings: (result.orgSettings ?? {}) as Record<string, unknown>,
    };
  } catch {
    // Database not available — fall back to single-tenant mode
    return null;
  }
}

/**
 * Resolve or auto-create a user record and attach to req.user (RBAC).
 */
async function resolveOrCreateUser(
  req: Request,
  email: string,
  defaultRole: 'admin' | 'sender' | 'viewer' = 'sender',
  organizationId?: string,
): Promise<void> {
  try {
    const db = getDb();

    // Look up existing user
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      req.user = {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
        role: existingUser.role as AuthenticatedUser['role'],
        organizationId: existingUser.organizationId,
        isActive: existingUser.isActive,
      };
      return;
    }

    // Auto-create user on first use
    // Lookup tenantId from organization or use default
    const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    let tenantId = DEFAULT_TENANT_ID;
    if (organizationId) {
      const [org] = await db
        .select({ tenantId: organizations.tenantId })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      tenantId = org?.tenantId || DEFAULT_TENANT_ID;
    }
    
    const [newUser] = await db
      .insert(users)
      .values({
        tenantId,
        email,
        name: email.split('@')[0],
        role: defaultRole,
        organizationId: organizationId || null,
        isActive: true,
      })
      .returning();

    req.user = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role as AuthenticatedUser['role'],
      organizationId: newUser.organizationId,
      isActive: newUser.isActive,
    };
  } catch {
    // If DB is unavailable, set a default admin user for single-tenant mode
    req.user = {
      id: 'system',
      email,
      name: 'System',
      role: defaultRole,
      organizationId: organizationId || null,
      isActive: true,
    };
  }
}

/**
 * Optional auth middleware — allows unauthenticated requests but attaches auth info if present.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (typeof req.query.apiKey === 'string' && req.query.apiKey.length > 0) {
    token = req.query.apiKey;
  }

  if (token) {
    const apiKey = process.env.API_KEY ?? process.env.SENDSIGN_API_KEY;

    if (token === apiKey) {
      (req as AuthenticatedRequest).authenticated = true;
    }
  }

  next();
}

/**
 * Get the organization ID from the request, or null if single-tenant mode.
 */
export function getOrganizationId(req: Request): string | null {
  return (req as AuthenticatedRequest).organization?.id ?? null;
}

/**
 * Get the full organization context from the request.
 */
export function getOrganization(req: Request): OrganizationContext | null {
  return (req as AuthenticatedRequest).organization ?? null;
}
