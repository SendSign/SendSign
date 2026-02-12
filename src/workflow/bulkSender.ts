import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection.js';
import { templates, envelopes, signers, fields, documents } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { mergeFields } from '../documents/mailMerge.js';
import { retrieveDocument } from '../storage/documentStore.js';
import { uploadDocument } from '../storage/documentStore.js';
import { sendEnvelope } from './envelopeManager.js';

export interface BulkRecipient {
  name: string;
  email: string;
  mergeData?: Record<string, string>;
}

export interface BulkOptions {
  templateId: string;
  tenantId?: string;
  fieldMapping?: Record<string, string>;
  rateLimit?: number;
  notifyOnComplete?: string;
  organizationId?: string | null;
}

export interface BulkResult {
  created: number;
  failed: number;
  envelopeIds: string[];
  errors: Array<{ row: number; error: string }>;
  batchId: string;
}

/**
 * Process bulk send with optional per-recipient merge data.
 */
export async function processBulkSend(
  templateId: string,
  recipients: BulkRecipient[],
  options?: BulkOptions,
): Promise<BulkResult> {
  const db = getDb();
  const batchId = uuidv4();

  // Get template
  const [template] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);

  if (!template) {
    throw new Error('Template not found');
  }

  const envelopeIds: string[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  // Use tenantId from options or template
  const tenantId = options?.tenantId || template.tenantId;

  // Get template document
  const templateDoc = await retrieveDocument(template.documentKey);

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    try {
      // Merge data if provided
      let finalDoc = templateDoc;
      if (recipient.mergeData && Object.keys(recipient.mergeData).length > 0) {
        finalDoc = await mergeFields(templateDoc, recipient.mergeData);
      }

      // Upload merged document
      const mergedDocKey = `bulk/${batchId}/${i}_${template.name}.pdf`;
      await uploadDocument(mergedDocKey, finalDoc);

      // Create envelope
      const [envelope] = await db
        .insert(envelopes)
        .values({
          tenantId,
          organizationId: options?.organizationId || template.organizationId,
          subject: template.name,
          message: `Generated from template: ${template.name}`,
          status: 'draft',
          signingOrder: 'sequential',
          createdBy: 'bulk-send',
          metadata: { batchId, recipientIndex: i },
        })
        .returning();

      // Create document record
      const [doc] = await db
        .insert(documents)
        .values({
          tenantId,
          envelopeId: envelope.id,
          filename: `${template.name}.pdf`,
          contentType: 'application/pdf',
          storagePath: mergedDocKey,
          documentHash: 'placeholder',
          order: 0,
        })
        .returning();

      // Create signer from recipient
      const [signer] = await db
        .insert(signers)
        .values({
          tenantId,
          envelopeId: envelope.id,
          name: recipient.name,
          email: recipient.email,
          role: 'signer',
          order: 1,
          status: 'pending',
        })
        .returning();

      // Copy fields from template to envelope
      const templateFields = template.fieldConfig as any[];
      if (Array.isArray(templateFields)) {
        for (const fieldConfig of templateFields) {
          await db.insert(fields).values({
            tenantId,
            envelopeId: envelope.id,
            documentId: doc.id,
            signerId: signer.id,
            type: fieldConfig.type,
            page: fieldConfig.page,
            x: fieldConfig.x,
            y: fieldConfig.y,
            width: fieldConfig.width,
            height: fieldConfig.height,
            required: fieldConfig.required ?? true,
            label: fieldConfig.label,
          });
        }
      }

      // Send envelope
      await sendEnvelope(envelope.id);

      envelopeIds.push(envelope.id);
    } catch (error) {
      errors.push({
        row: i + 1,
        error: (error as Error).message,
      });
    }

    // Rate limiting
    if (options?.rateLimit) {
      await new Promise((resolve) => setTimeout(resolve, options.rateLimit));
    }
  }

  return {
    created: envelopeIds.length,
    failed: errors.length,
    envelopeIds,
    errors,
    batchId,
  };
}

export async function getBulkSendStatus(batchId: string): Promise<{
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
}> {
  const db = getDb();

  // Find all envelopes in this batch
  const batchEnvelopes = await db
    .select()
    .from(envelopes)
    .where(eq(envelopes.metadata, { batchId }));

  const total = batchEnvelopes.length;
  const completed = batchEnvelopes.filter((e) => e.status === 'completed').length;
  const failed = batchEnvelopes.filter((e) => e.status === 'voided' || e.status === 'expired').length;
  const inProgress = total - completed - failed;

  return { total, completed, failed, inProgress };
}
