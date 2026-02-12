/**
 * Type extensions for Express Request object.
 * 
 * This file augments the Express Request type to include custom properties
 * added by our middleware (authentication, tenant context, RBAC, etc.).
 */

import type { Tenant, User } from '../db/schema.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * The current tenant (set by tenantContext middleware).
       * Only available after authentication + tenant resolution.
       */
      tenant?: Tenant;

      /**
       * The current tenant ID (set by tenantContext middleware).
       * Shortcut for req.tenant?.id.
       */
      tenantId?: string;

      /**
       * The current user (set by auth middleware).
       * Available after authentication.
       */
      tenantUser?: User;

      /**
       * Whether the request is authenticated (set by auth middleware).
       */
      authenticated?: boolean;

      /**
       * Organization context (legacy, from the auth middleware).
       * Includes organization details for backwards compatibility.
       */
      organization?: {
        id: string;
        name: string;
        slug: string;
        plan: string;
        envelopeLimit: number | null;
        envelopesUsed: number;
        settings: Record<string, unknown>;
        ownerEmail?: string;
      };
    }
  }
}

// This export is required for TypeScript to treat this as a module
export {};
