/**
 * Role-Based Access Control (RBAC) Middleware — Step 27
 *
 * Provides middleware factories for role checking and resource ownership validation.
 */

import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../../db/connection.js';
import { envelopes } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────

export type UserRole = 'admin' | 'sender' | 'viewer';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  organizationId: string | null;
  isActive: boolean;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// ─── Permission Matrix ──────────────────────────────────────────

export const PERMISSIONS = {
  createEnvelope: ['admin', 'sender'] as UserRole[],
  sendEnvelope: ['admin', 'sender'] as UserRole[],
  viewAllEnvelopes: ['admin', 'viewer'] as UserRole[],
  voidEnvelope: ['admin', 'sender'] as UserRole[],
  correctEnvelope: ['admin', 'sender'] as UserRole[],
  transferEnvelope: ['admin', 'sender'] as UserRole[],
  manageTemplates: ['admin', 'sender'] as UserRole[],
  lockTemplates: ['admin'] as UserRole[],
  managePowerForms: ['admin', 'sender'] as UserRole[],
  bulkSend: ['admin', 'sender'] as UserRole[],
  viewAnalytics: ['admin', 'sender', 'viewer'] as UserRole[],
  manageUsers: ['admin'] as UserRole[],
  manageFolders: ['admin', 'sender', 'viewer'] as UserRole[],
  configureSSO: ['admin'] as UserRole[],
  manageWebhooks: ['admin'] as UserRole[],
  manageRetention: ['admin'] as UserRole[],
  viewAuditTrail: ['admin', 'sender', 'viewer'] as UserRole[],
} as const;

// ─── Middleware: requireRole ────────────────────────────────────

/**
 * Middleware factory that checks if the authenticated user has one of the specified roles.
 *
 * Usage: router.post('/envelopes', requireRole('admin', 'sender'), handler)
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        error: 'Account is deactivated. Contact your administrator.',
      });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        success: false,
        error: `Insufficient permissions. Required role: ${roles.join(' or ')}`,
      });
      return;
    }

    next();
  };
}

// ─── Middleware: requireOwnership ────────────────────────────────

/**
 * Middleware that checks if the authenticated user owns the envelope.
 * Admin users bypass this check.
 * Viewers can read but this middleware only applies to mutation routes.
 *
 * Usage: router.post('/envelopes/:id/void', requireOwnership('id'), handler)
 */
export function requireOwnership(paramName: string = 'id') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Admins bypass ownership check
    if (user.role === 'admin') {
      next();
      return;
    }

    const resourceId = req.params[paramName];
    if (!resourceId) {
      res.status(400).json({
        success: false,
        error: `Missing resource parameter: ${paramName}`,
      });
      return;
    }

    try {
      const db = getDb();
      const [envelope] = await db
        .select({ createdBy: envelopes.createdBy })
        .from(envelopes)
        .where(eq(envelopes.id, resourceId))
        .limit(1);

      if (!envelope) {
        res.status(404).json({
          success: false,
          error: 'Resource not found',
        });
        return;
      }

      // Check if the user created this envelope
      if (envelope.createdBy !== user.id && envelope.createdBy !== user.email) {
        res.status(403).json({
          success: false,
          error: 'You do not have permission to modify this resource',
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to verify resource ownership',
      });
    }
  };
}

// ─── Middleware: requirePermission ───────────────────────────────

/**
 * Convenience middleware using the permission matrix.
 *
 * Usage: router.post('/sso/config', requirePermission('configureSSO'), handler)
 */
export function requirePermission(permission: keyof typeof PERMISSIONS) {
  const allowedRoles = PERMISSIONS[permission];
  return requireRole(...allowedRoles);
}
