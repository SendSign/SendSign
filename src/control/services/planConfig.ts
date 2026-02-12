/**
 * Centralized plan configuration for SendSign.
 *
 * Defines limits and features for each plan tier.
 * Used by provisioning service and usage meter.
 */

export interface PlanLimits {
  envelopeLimit: number; // -1 = unlimited
  userLimit: number;
  templateLimit: number;
  bulkSendLimit: number;
  auditRetentionDays: number; // -1 = unlimited
  features: Record<string, boolean>;
}

export const PLAN_DEFAULTS: Record<string, PlanLimits> = {
  free: {
    envelopeLimit: 5, // per month
    userLimit: 1,
    templateLimit: 3,
    bulkSendLimit: 0, // no bulk send
    auditRetentionDays: 7,
    features: {
      basicSigning: true,
      templates: true,
      auditTrail: true,
      branding: false,
      sso: false,
      bulkSend: false,
      apiAccess: true,
      advancedFields: false,
      webhooks: false,
      qes: false,
    },
  },
  pro: {
    envelopeLimit: 100, // per month
    userLimit: 5,
    templateLimit: 25,
    bulkSendLimit: 50,
    auditRetentionDays: 90,
    features: {
      basicSigning: true,
      templates: true,
      auditTrail: true,
      branding: true,
      sso: false,
      bulkSend: true,
      apiAccess: true,
      advancedFields: true,
      webhooks: true,
      qes: false,
    },
  },
  business: {
    envelopeLimit: 500, // per month
    userLimit: 25,
    templateLimit: 100,
    bulkSendLimit: 250,
    auditRetentionDays: 365,
    features: {
      basicSigning: true,
      templates: true,
      auditTrail: true,
      branding: true,
      sso: true,
      bulkSend: true,
      apiAccess: true,
      advancedFields: true,
      webhooks: true,
      qes: false,
    },
  },
  enterprise: {
    envelopeLimit: -1, // unlimited
    userLimit: -1,
    templateLimit: -1,
    bulkSendLimit: -1,
    auditRetentionDays: -1, // unlimited
    features: {
      basicSigning: true,
      templates: true,
      auditTrail: true,
      branding: true,
      sso: true,
      bulkSend: true,
      apiAccess: true,
      advancedFields: true,
      webhooks: true,
      qes: true,
      customDomain: true,
      dedicatedInfra: true,
    },
  },
  managed: {
    envelopeLimit: -1, // unlimited
    userLimit: 5,
    templateLimit: -1, // unlimited
    bulkSendLimit: 100,
    auditRetentionDays: 30,
    features: {
      basicSigning: true,
      templates: true,
      auditTrail: true,
      branding: false,
      sso: false,
      bulkSend: true,
      apiAccess: true,
      advancedFields: true,
      webhooks: true,
      qes: false,
    },
  },
  whitelabel: {
    envelopeLimit: -1,         // unlimited
    userLimit: -1,             // unlimited
    templateLimit: -1,         // unlimited
    bulkSendLimit: -1,         // unlimited
    auditRetentionDays: -1,    // unlimited (never expire)
    features: {
      basicSigning: true,
      templates: true,
      auditTrail: true,
      branding: true,          // Custom branding allowed
      sso: true,               // SSO enabled
      bulkSend: true,
      apiAccess: true,
      advancedFields: true,
      webhooks: true,
      qes: true,               // QES support
      customDomain: true,
      dedicatedInfra: true,
      scim: true,              // SCIM provisioning
      auditExport: true,       // Audit log export
      embeddedSigning: true,   // iframe embed
      customEmailDomain: true, // Custom email domain
    },
  },
};

/**
 * Get plan defaults for a specific plan.
 * Returns free plan defaults if plan not found.
 */
export function getPlanDefaults(plan: string): PlanLimits {
  return PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.free;
}

/**
 * Reserved slugs that cannot be used as tenant identifiers.
 */
export const RESERVED_SLUGS = new Set([
  'api',
  'app',
  'admin',
  'www',
  'mail',
  'smtp',
  'ftp',
  'status',
  'docs',
  'blog',
  'help',
  'support',
  'control',
  'health',
  'cdn',
  'static',
  'assets',
  'public',
  'private',
  'internal',
  'system',
  'root',
  'test',
  'demo',
  'staging',
  'prod',
  'production',
  'dev',
  'development',
]);

/**
 * Slug validation regex: lowercase alphanumeric + hyphens,
 * cannot start or end with hyphen.
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/**
 * Validate a tenant slug.
 * Returns null if valid, or an error message if invalid.
 */
export function validateSlug(slug: string): string | null {
  // Length check
  if (slug.length < 3 || slug.length > 50) {
    return 'Slug must be between 3 and 50 characters';
  }

  // Format check
  if (!SLUG_PATTERN.test(slug)) {
    return 'Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen';
  }

  // Reserved words check
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    return `Slug "${slug}" is reserved and cannot be used`;
  }

  return null;
}
