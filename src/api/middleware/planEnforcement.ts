/**
 * Plan tier enforcement middleware.
 * Checks organization plan limits before allowing certain operations.
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest, OrganizationContext } from './auth.js';

// ─── Plan Definitions ───────────────────────────────────────────────

export interface PlanTier {
  name: string;
  envelopeLimit: number | null; // null = unlimited
  verificationLevels: string[];
  integrationsEnabled: boolean;
  ssoEnabled: boolean;
  customRetention: boolean;
  maxSignersPerEnvelope: number;
  apiRateLimit: number; // requests per minute
  supportLevel: 'community' | 'email' | 'priority';
}

export const PLAN_TIERS: Record<string, PlanTier> = {
  free: {
    name: 'Free',
    envelopeLimit: 5,
    verificationLevels: ['simple'],
    integrationsEnabled: false,
    ssoEnabled: false,
    customRetention: false,
    maxSignersPerEnvelope: 5,
    apiRateLimit: 30,
    supportLevel: 'community',
  },
  pro: {
    name: 'Pro',
    envelopeLimit: 100,
    verificationLevels: ['simple', 'advanced'],
    integrationsEnabled: true,
    ssoEnabled: false,
    customRetention: true,
    maxSignersPerEnvelope: 25,
    apiRateLimit: 200,
    supportLevel: 'email',
  },
  enterprise: {
    name: 'Enterprise',
    envelopeLimit: null, // unlimited
    verificationLevels: ['simple', 'advanced', 'qualified'],
    integrationsEnabled: true,
    ssoEnabled: true,
    customRetention: true,
    maxSignersPerEnvelope: 100,
    apiRateLimit: 1000,
    supportLevel: 'priority',
  },
};

/**
 * Get the plan tier definition for an organization.
 */
export function getPlanTier(org: OrganizationContext | null): PlanTier {
  if (!org) return PLAN_TIERS.enterprise; // Single-tenant = unlimited
  return PLAN_TIERS[org.plan] ?? PLAN_TIERS.free;
}

/**
 * Middleware: Check envelope creation limits.
 * Must be placed after authenticate middleware.
 */
export function enforceEnvelopeLimit(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  const org = authReq.organization;

  // Single-tenant mode — no limits
  if (!org) {
    next();
    return;
  }

  const plan = getPlanTier(org);

  // Check monthly limit
  if (plan.envelopeLimit !== null && org.envelopesUsed >= plan.envelopeLimit) {
    res.status(429).json({
      success: false,
      error: `Monthly envelope limit reached (${plan.envelopeLimit} envelopes on ${plan.name} plan). Upgrade to increase your limit.`,
      data: {
        plan: org.plan,
        limit: plan.envelopeLimit,
        used: org.envelopesUsed,
        upgradeUrl: '/pricing',
      },
    });
    return;
  }

  next();
}

/**
 * Middleware: Check if a specific feature is available on the org's plan.
 */
export function requireFeature(feature: keyof Pick<PlanTier, 'integrationsEnabled' | 'ssoEnabled' | 'customRetention'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const org = authReq.organization;

    // Single-tenant mode — all features available
    if (!org) {
      next();
      return;
    }

    const plan = getPlanTier(org);

    if (!plan[feature]) {
      res.status(403).json({
        success: false,
        error: `Feature "${feature}" is not available on the ${plan.name} plan. Upgrade to access this feature.`,
        data: {
          plan: org.plan,
          feature,
          requiredPlan: getMinimumPlan(feature),
        },
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Check if the verification level is allowed on the org's plan.
 */
export function enforceVerificationLevel(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  const org = authReq.organization;

  // Single-tenant mode — all levels allowed
  if (!org) {
    next();
    return;
  }

  const plan = getPlanTier(org);
  const requestedLevel = req.body?.verificationLevel;

  if (requestedLevel && !plan.verificationLevels.includes(requestedLevel)) {
    res.status(403).json({
      success: false,
      error: `Verification level "${requestedLevel}" is not available on the ${plan.name} plan.`,
      data: {
        plan: org.plan,
        allowedLevels: plan.verificationLevels,
        requiredPlan: requestedLevel === 'qualified' ? 'enterprise' : 'pro',
      },
    });
    return;
  }

  next();
}

/**
 * Get the minimum plan required for a feature.
 */
function getMinimumPlan(feature: string): string {
  switch (feature) {
    case 'integrationsEnabled':
    case 'customRetention':
      return 'pro';
    case 'ssoEnabled':
      return 'enterprise';
    default:
      return 'pro';
  }
}
