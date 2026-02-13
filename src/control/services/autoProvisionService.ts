/**
 * Auto-provisioning service for new user signups.
 * 
 * When a user signs up via OAuth or email/password:
 * 1. Check if user already exists → log them in
 * 2. If new user → create tenant (plan='free') + user + API key → log them in
 * 
 * Each new signup gets their own tenant (personal account).
 */

import { getDb } from '../../db/connection.js';
import { tenants, users, apiKeys } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getPlanDefaults } from './planConfig.js';

interface AutoProvisionParams {
  email: string;
  name: string;
  password?: string;       // If registering via email/password
  oauthProvider?: 'google' | 'github'; // If registering via OAuth
  oauthId?: string;
  avatarUrl?: string;
}

interface AutoProvisionResult {
  tenant: any;
  user: any;
  apiKey: string;
  isNewUser: boolean;
}

/**
 * Auto-provision a tenant for a new user, or return existing tenant if user exists.
 * 
 * Flow:
 * 1. Check if email already exists → return existing tenant/user
 * 2. Generate unique slug from email
 * 3. Create tenant with plan='free'
 * 4. Create user as admin
 * 5. Generate API key
 * 6. Return everything
 */
export async function autoProvisionTenant(params: AutoProvisionParams): Promise<AutoProvisionResult> {
  const db = getDb();
  const { email, name, password, oauthProvider, oauthId, avatarUrl } = params;

  // Check if user already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    // User exists — return their tenant info
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, existingUser.tenantId))
      .limit(1);

    // Get an API key for this user
    const [apiKey] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, existingUser.id))
      .limit(1);

    return {
      tenant,
      user: existingUser,
      apiKey: apiKey?.key || 'NO_API_KEY', // Should always exist, but fallback
      isNewUser: false,
    };
  }

  // New user — create tenant + user
  const slug = await generateUniqueSlug(email);
  const planDefaults = getPlanDefaults('free');

  // Create tenant with free plan
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `${name}'s Workspace`,
      slug,
      plan: 'free',
      status: 'active',
      envelopeLimit: planDefaults.envelopeLimit,
      userLimit: planDefaults.userLimit,
      templateLimit: planDefaults.templateLimit,
      bulkSendLimit: planDefaults.bulkSendLimit,
      auditRetentionDays: planDefaults.auditRetentionDays,
      features: planDefaults.features,
    })
    .returning();

  // Hash password if provided (email/password signup)
  let hashedPassword: string | null = null;
  if (password) {
    hashedPassword = await bcrypt.hash(password, 10);
  }

  // Create user as admin
  const [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email,
      name,
      role: 'admin',
      password: hashedPassword,
      oauthProvider: oauthProvider || null,
      oauthId: oauthId || null,
      avatarUrl: avatarUrl || null,
    })
    .returning();

  // Generate API key
  const apiKeyValue = `ss_live_${crypto.randomBytes(32).toString('hex')}`;
  await db.insert(apiKeys).values({
    userId: user.id,
    tenantId: tenant.id,
    key: apiKeyValue,
    name: 'Default API Key',
    lastUsedAt: null,
  });

  console.log(`✓ Auto-provisioned tenant: ${tenant.slug} (${email})`);

  return {
    tenant,
    user,
    apiKey: apiKeyValue,
    isNewUser: true,
  };
}

/**
 * Generate a unique slug from an email address.
 * Format: username from email + random suffix if needed for uniqueness.
 */
async function generateUniqueSlug(email: string): Promise<string> {
  const db = getDb();
  
  // Extract username from email (before @)
  let baseSlug = email.split('@')[0].toLowerCase();
  
  // Sanitize: keep only alphanumeric and hyphens
  baseSlug = baseSlug.replace(/[^a-z0-9-]/g, '-');
  
  // Remove leading/trailing hyphens
  baseSlug = baseSlug.replace(/^-+|-+$/g, '');
  
  // Ensure minimum length
  if (baseSlug.length < 3) {
    baseSlug = 'user-' + baseSlug;
  }

  // Check uniqueness
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const [existing] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (!existing) {
      return slug;
    }

    // Try with suffix
    slug = `${baseSlug}-${suffix}`;
    suffix++;

    // Safety limit
    if (suffix > 1000) {
      throw new Error('Failed to generate unique slug');
    }
  }
}
