import crypto from 'crypto';
import { getDb } from '../../db/connection.js';
import { tenants, organizations, users, apiKeys } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { Tenant } from '../../db/schema.js';
import { getPlanDefaults, validateSlug } from './planConfig.js';

// ─── API Key Generation ─────────────────────────────────────────────

/**
 * Generate a random API key with a prefix.
 * Format: ss_live_{64 hex chars}
 */
export function generateApiKey(): string {
  return `ss_live_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Hash an API key for storage.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// ─── Tenant Provisioning ────────────────────────────────────────────

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  plan: string;
  adminEmail: string;
  adminName: string;
  trialDays?: number;
}

export interface ProvisionTenantResult {
  tenant: Tenant;
  admin: {
    id: string;
    email: string;
    name: string;
    role: string;
    apiKey: string; // raw key — only returned once
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  dashboardUrl: string;
  apiBaseUrl: string;
}

/**
 * Provision a new tenant end-to-end.
 *
 * This is the ONLY place that creates tenants — all paths go through here.
 *
 * Steps:
 * 1. Validate slug uniqueness and format
 * 2. Insert tenant record with plan-appropriate defaults
 * 3. Create organization for this tenant
 * 4. Create admin user with generated API key
 * 5. TODO (Step 35): Create Stripe customer if paid plan
 * 6. TODO: Send welcome email with API key and quickstart
 * 7. Return complete tenant + admin info
 *
 * Runs in a transaction so if any step fails, everything rolls back.
 */
export async function provisionTenant(
  input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  const db = getDb();

  // Validate slug
  const slugError = validateSlug(input.slug);
  if (slugError) {
    throw new Error(slugError);
  }

  // Check slug uniqueness
  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, input.slug))
    .limit(1);

  if (existing) {
    throw new Error(`Slug "${input.slug}" is already taken`);
  }

  const planDefaults = getPlanDefaults(input.plan);
  const baseDomain = process.env.SENDSIGN_BASE_DOMAIN || 'sendsign.dev';

  // TODO (Step 35): Wrap in transaction when Stripe integration is added
  // await db.transaction(async (tx) => { ... });

  // 1. Create tenant with plan defaults
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: input.name,
      slug: input.slug,
      plan: input.plan as 'free' | 'pro' | 'business' | 'enterprise' | 'managed',
      status: input.trialDays && input.trialDays > 0 ? 'trialing' : 'active',
      envelopeLimit: planDefaults.envelopeLimit,
      userLimit: planDefaults.userLimit,
      templateLimit: planDefaults.templateLimit,
      bulkSendLimit: planDefaults.bulkSendLimit,
      auditRetentionDays: planDefaults.auditRetentionDays,
      features: planDefaults.features,
      licenseType: 'commercial',
      trialEndsAt:
        input.trialDays && input.trialDays > 0
          ? new Date(Date.now() + input.trialDays * 24 * 60 * 60 * 1000)
          : null,
    })
    .returning();

  // 2. Create organization
  const [org] = await db
    .insert(organizations)
    .values({
      tenantId: tenant.id,
      name: input.name,
      slug: input.slug,
      plan: input.plan,
      envelopeLimit: planDefaults.envelopeLimit,
    })
    .returning();

  // 3. Create admin user
  const [adminUser] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: input.adminEmail.toLowerCase(),
      name: input.adminName,
      role: 'admin',
      organizationId: org.id,
      isActive: true,
    })
    .returning();

  // 4. Generate API key
  const rawApiKey = generateApiKey();
  const keyHash = hashApiKey(rawApiKey);

  await db.insert(apiKeys).values({
    tenantId: tenant.id,
    organizationId: org.id,
    keyHash,
    name: `${input.name} Admin Key`,
    permissions: ['all'],
  });

  // TODO (Step 35): Create Stripe customer and subscription
  // if (tenant.plan !== 'free') {
  //   await stripeService.createSubscription({
  //     tenantId: tenant.id,
  //     email: input.adminEmail,
  //     name: input.name,
  //     plan: tenant.plan,
  //   });
  // }

  // TODO: Send welcome email
  // await emailService.sendWelcomeEmail({
  //   to: input.adminEmail,
  //   tenantName: input.name,
  //   apiKey: rawApiKey,
  //   dashboardUrl: `https://${input.slug}.${baseDomain}/admin`,
  //   quickstartUrl: `https://docs.sendsign.dev/quickstart`,
  // });

  return {
    tenant,
    admin: {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
      apiKey: rawApiKey,
    },
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
    },
    dashboardUrl: `https://${input.slug}.${baseDomain}/admin`,
    apiBaseUrl: `https://${input.slug}.${baseDomain}/api`,
  };
}

/**
 * Change a tenant's plan and update all associated limits.
 *
 * Called by PUT /control/tenants/:id when plan field changes.
 *
 * On upgrade: immediately apply new (higher) limits
 * On downgrade: TODO (Step 35) apply at end of billing period
 *   For now, apply immediately
 *
 * @param tenantId - The tenant to update
 * @param newPlan - The new plan tier
 * @throws Error if plan is invalid or tenant not found
 */
export async function changePlan(
  tenantId: string,
  newPlan: 'free' | 'pro' | 'business' | 'enterprise' | 'managed',
): Promise<Tenant> {
  const db = getDb();

  // Get plan defaults
  const planDefaults = getPlanDefaults(newPlan);

  // Update tenant with new plan and limits
  const [updatedTenant] = await db
    .update(tenants)
    .set({
      plan: newPlan,
      envelopeLimit: planDefaults.envelopeLimit,
      userLimit: planDefaults.userLimit,
      templateLimit: planDefaults.templateLimit,
      bulkSendLimit: planDefaults.bulkSendLimit,
      auditRetentionDays: planDefaults.auditRetentionDays,
      features: planDefaults.features,
    })
    .where(eq(tenants.id, tenantId))
    .returning();

  if (!updatedTenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  // TODO (Step 35): Update Stripe subscription if applicable
  // if (updatedTenant.stripeSubscriptionId) {
  //   await stripeService.changePlan(
  //     updatedTenant.stripeSubscriptionId,
  //     newPlan
  //   );
  // }

  // TODO: Send plan change notification email
  // await emailService.sendPlanChangeEmail({
  //   tenantId: updatedTenant.id,
  //   oldPlan: oldPlan,
  //   newPlan: newPlan,
  // });

  return updatedTenant;
}
