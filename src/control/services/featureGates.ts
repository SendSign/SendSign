import { Request, Response, NextFunction } from 'express';

/**
 * Feature Gating System for SendSign
 *
 * Core signing functionality (API, MCP, webhooks, templates, bulk send, signing ceremony,
 * PDF flattening, completion certificates) is NEVER gated and available to ALL plans.
 *
 * This file defines which ENTERPRISE/IT/COMPLIANCE features require the White-Label plan.
 */

/**
 * Features gated to white-label plan only.
 * These are enterprise compliance/IT features, not core signing.
 */
export const WHITELABEL_FEATURES = [
  'sso',                        // SAML/OIDC Single Sign-On
  'scim',                       // SCIM user provisioning
  'audit_export',               // Audit log export (CSV/JSON download)
  'unlimited_audit_retention',  // Audit logs kept forever (free/managed = 30 days)
  'custom_rbac',                // Custom roles beyond admin/sender
  'embedded_signing',           // iframe embed for their app
  'custom_email_domain',        // Send from their domain, not ours
  'custom_branding',            // Remove "Powered by SendSign" badge, custom logo/colors
  'sla',                        // SLA guarantees
  'dedicated_support',          // Priority support channel
] as const;

export type WhitelabelFeature = typeof WHITELABEL_FEATURES[number];

/**
 * Check if a tenant has access to a feature.
 *
 * Returns true if:
 * - The tenant's plan is 'whitelabel' or 'enterprise' (same thing)
 *
 * Returns false for 'free', 'managed', 'pro', 'business' plans.
 */
export function hasFeature(tenantPlan: string, feature: WhitelabelFeature): boolean {
  // White-label and enterprise plans get all features
  if (tenantPlan === 'whitelabel' || tenantPlan === 'enterprise') {
    return true;
  }

  // All other plans (free, managed, pro, business) do NOT get whitelabel features
  return false;
}

/**
 * Express middleware that checks if the tenant has access to a specific feature.
 * Returns 403 with an upgrade message if the tenant doesn't have access.
 *
 * Usage:
 *   router.post('/sso/configure', requireFeature('sso'), async (req, res) => { ... });
 */
export function requireFeature(feature: WhitelabelFeature) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip if no tenant context (shouldn't happen on protected routes)
    if (!req.tenant) {
      return next();
    }

    if (!hasFeature(req.tenant.plan, feature)) {
      res.status(403).json({
        success: false,
        error: 'Feature not available',
        feature,
        message: `${feature.replace(/_/g, ' ')} is available on the White-Label plan. Contact enterprise@sendsign.dev for pricing.`,
        upgradeContact: 'enterprise@sendsign.dev',
        currentPlan: req.tenant.plan,
        requiredPlan: 'whitelabel',
      });
      return;
    }

    next();
  };
}

/**
 * Check if a tenant can create a custom role.
 * Basic roles (admin, sender) are available to all plans.
 * Any other role requires the white-label plan.
 */
export function canCreateCustomRole(tenantPlan: string, roleName: string): boolean {
  // Basic roles available to everyone
  const basicRoles = ['admin', 'sender'];
  if (basicRoles.includes(roleName)) {
    return true;
  }

  // Custom roles require white-label
  return hasFeature(tenantPlan, 'custom_rbac');
}

/**
 * Get audit log retention period for a tenant's plan (in days).
 * Returns -1 for unlimited retention (white-label only).
 */
export function getAuditRetentionDays(tenantPlan: string): number {
  if (hasFeature(tenantPlan, 'unlimited_audit_retention')) {
    return -1; // unlimited
  }
  return 30; // 30 days for free/managed
}

/**
 * Check if a tenant can remove the "Powered by SendSign" badge.
 * Only white-label plans can remove branding.
 */
export function canRemoveBranding(tenantPlan: string): boolean {
  return hasFeature(tenantPlan, 'custom_branding');
}

/**
 * Get all available features for a tenant's plan.
 * Returns an object with feature names as keys and boolean availability as values.
 */
export function getTenantFeatures(tenantPlan: string): Record<WhitelabelFeature, boolean> {
  const features: Record<string, boolean> = {};

  for (const feature of WHITELABEL_FEATURES) {
    features[feature] = hasFeature(tenantPlan, feature);
  }

  return features as Record<WhitelabelFeature, boolean>;
}

/**
 * Feature descriptions for API responses and UI.
 */
export const FEATURE_DESCRIPTIONS: Record<WhitelabelFeature, string> = {
  sso: 'SAML 2.0 and OIDC Single Sign-On',
  scim: 'SCIM 2.0 User Provisioning',
  audit_export: 'Export Audit Logs (CSV/JSON)',
  unlimited_audit_retention: 'Unlimited Audit Log Retention',
  custom_rbac: 'Custom RBAC Roles',
  embedded_signing: 'Embedded Signing (iframe)',
  custom_email_domain: 'Custom Email Sending Domain',
  custom_branding: 'Remove "Powered by SendSign" Badge',
  sla: 'SLA Guarantees',
  dedicated_support: 'Dedicated Support Channel',
};
