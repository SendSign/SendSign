/**
 * SSO configuration management.
 * Multi-tenant SSO configs stored in database.
 */

import { getDb } from '../db/connection.js';
import { ssoConfigurations, type SsoConfiguration, organizations } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { createSSOProvider, type SSOProvider } from './sso.js';

// ─── Database operations ────────────────────────────────────────────

/**
 * Get SSO configuration for an organization.
 */
export async function getSSOConfig(organizationId: string): Promise<SsoConfiguration | null> {
  const db = getDb();
  const results = await db
    .select()
    .from(ssoConfigurations)
    .where(eq(ssoConfigurations.organizationId, organizationId))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Create or update SSO configuration.
 */
export async function upsertSSOConfig(
  organizationId: string,
  providerType: 'saml' | 'oidc',
  config: Record<string, unknown>,
  enabled: boolean = true,
): Promise<SsoConfiguration> {
  const db = getDb();

  const existing = await getSSOConfig(organizationId);

  if (existing) {
    const [updated] = await db
      .update(ssoConfigurations)
      .set({
        providerType,
        config,
        enabled,
        updatedAt: new Date(),
      })
      .where(eq(ssoConfigurations.id, existing.id))
      .returning();

    return updated;
  }

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
  
  const [created] = await db
    .insert(ssoConfigurations)
    .values({
      tenantId,
      organizationId,
      providerType,
      config,
      enabled,
    })
    .returning();

  return created;
}

/**
 * Delete SSO configuration.
 */
export async function deleteSSOConfig(organizationId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(ssoConfigurations)
    .where(eq(ssoConfigurations.organizationId, organizationId));
}

/**
 * Check if SSO is enabled for an organization.
 */
export async function isSSOEnabled(organizationId: string): Promise<boolean> {
  const config = await getSSOConfig(organizationId);
  return config?.enabled ?? false;
}

/**
 * Get SSO provider instance for an organization.
 */
export async function getSSOProvider(organizationId: string): Promise<SSOProvider | null> {
  const config = await getSSOConfig(organizationId);

  if (!config || !config.enabled) {
    return null;
  }

  const providerConfig = config.config as Record<string, unknown>;

  // Add organizationId to config
  providerConfig.organizationId = organizationId;

  return createSSOProvider(config.providerType as 'saml' | 'oidc', providerConfig as any);
}

/**
 * Detect organization from email domain.
 * Returns organization ID if a matching SSO config is found.
 */
export async function detectOrganizationFromEmail(email: string): Promise<string | null> {
  const domain = email.split('@')[1];
  if (!domain) {
    return null;
  }

  const db = getDb();
  const configs = await db.select().from(ssoConfigurations).where(eq(ssoConfigurations.enabled, true));

  for (const config of configs) {
    const configData = config.config as Record<string, unknown>;
    const allowedDomains = configData.allowedDomains as string[] | undefined;

    if (allowedDomains && allowedDomains.includes(domain)) {
      return config.organizationId;
    }
  }

  return null;
}

/**
 * Extract email domain from email address.
 */
export function extractDomain(email: string): string | null {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1] : null;
}
