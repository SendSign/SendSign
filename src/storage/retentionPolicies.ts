/**
 * Retention policy management and presets.
 * Handles document lifecycle based on industry-specific or custom retention rules.
 */

import { getDb } from '../db/connection.js';
import { retentionPolicies, type RetentionPolicy, type InsertRetentionPolicy } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// ─── Policy Presets ─────────────────────────────────────────────────

export interface PolicyPreset {
  name: string;
  description: string;
  retentionDays: number;
  documentTypes?: string[];
  autoDelete: boolean;
  notifyBefore: number;
  industry: string;
}

export const POLICY_PRESETS: Record<string, PolicyPreset> = {
  healthcare: {
    name: 'Healthcare (HIPAA)',
    description: 'Healthcare records retention per HIPAA requirements',
    retentionDays: 2555, // 7 years
    documentTypes: ['patient_consent', 'medical_records', 'hipaa_forms'],
    autoDelete: false, // Manual review recommended for healthcare
    notifyBefore: 90,
    industry: 'healthcare',
  },
  financial: {
    name: 'Financial Services (SEC/FINRA)',
    description: 'Financial records retention per SEC and FINRA rules',
    retentionDays: 2555, // 7 years
    documentTypes: ['loan_agreement', 'investment_docs', 'compliance_forms'],
    autoDelete: false,
    notifyBefore: 90,
    industry: 'financial',
  },
  tax: {
    name: 'Tax Records (IRS)',
    description: 'Tax document retention per IRS guidelines',
    retentionDays: 2555, // 7 years
    documentTypes: ['tax_return', 'w2', '1099', 'receipt'],
    autoDelete: false,
    notifyBefore: 180,
    industry: 'tax',
  },
  employment: {
    name: 'Employment Records',
    description: 'Employment-related document retention',
    retentionDays: 1825, // 5 years
    documentTypes: ['employment_contract', 'offer_letter', 'nda', 'performance_review'],
    autoDelete: false,
    notifyBefore: 60,
    industry: 'hr',
  },
  general: {
    name: 'General Business',
    description: 'Standard business document retention',
    retentionDays: 1095, // 3 years
    documentTypes: ['contract', 'agreement', 'invoice'],
    autoDelete: false,
    notifyBefore: 30,
    industry: 'general',
  },
  gdpr_minimal: {
    name: 'GDPR Minimal',
    description: 'Minimal retention for GDPR compliance (data minimization)',
    retentionDays: 365, // 1 year
    documentTypes: [],
    autoDelete: true, // Auto-delete for GDPR right to erasure
    notifyBefore: 30,
    industry: 'gdpr',
  },
};

// ─── Database Operations ────────────────────────────────────────────

/**
 * Create a retention policy.
 */
export async function createPolicy(input: InsertRetentionPolicy): Promise<RetentionPolicy> {
  const db = getDb();
  const [policy] = await db.insert(retentionPolicies).values(input).returning();
  return policy;
}

/**
 * Get a retention policy by ID.
 */
export async function getPolicy(id: string): Promise<RetentionPolicy | null> {
  const db = getDb();
  const results = await db.select().from(retentionPolicies).where(eq(retentionPolicies.id, id)).limit(1);
  return results[0] ?? null;
}

/**
 * List all policies (including custom ones).
 */
export async function listPolicies(organizationId?: string): Promise<RetentionPolicy[]> {
  const db = getDb();
  let query = db.select().from(retentionPolicies);

  if (organizationId) {
    query = query.where(eq(retentionPolicies.organizationId, organizationId)) as any;
  }

  return query;
}

/**
 * Update a retention policy.
 */
export async function updatePolicy(
  id: string,
  updates: Partial<InsertRetentionPolicy>,
): Promise<RetentionPolicy> {
  const db = getDb();
  const [updated] = await db
    .update(retentionPolicies)
    .set(updates)
    .where(eq(retentionPolicies.id, id))
    .returning();

  return updated;
}

/**
 * Delete a retention policy.
 */
export async function deletePolicy(id: string): Promise<void> {
  const db = getDb();
  await db.delete(retentionPolicies).where(eq(retentionPolicies.id, id));
}

/**
 * Create all preset policies for an organization.
 */
export async function createPresetPolicies(organizationId?: string): Promise<RetentionPolicy[]> {
  const db = getDb();
  const policies: RetentionPolicy[] = [];

  for (const preset of Object.values(POLICY_PRESETS)) {
    const [policy] = await db
      .insert(retentionPolicies)
      .values({
        organizationId: organizationId ?? null,
        name: preset.name,
        description: preset.description,
        retentionDays: preset.retentionDays,
        documentTypes: preset.documentTypes,
        autoDelete: preset.autoDelete,
        notifyBefore: preset.notifyBefore,
      })
      .returning();

    policies.push(policy);
  }

  return policies;
}

/**
 * Get recommended policy for a document type.
 */
export function getRecommendedPolicy(documentType: string): PolicyPreset | null {
  for (const preset of Object.values(POLICY_PRESETS)) {
    if (preset.documentTypes?.includes(documentType)) {
      return preset;
    }
  }

  // Default to general business
  return POLICY_PRESETS.general;
}
