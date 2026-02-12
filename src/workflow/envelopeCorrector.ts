import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection.js';
import { envelopes, signers, fields } from '../db/schema.js';
import { logEvent } from '../audit/auditLogger.js';
import { assignToken, voidToken } from '../ceremony/tokenGenerator.js';

export interface EnvelopeCorrection {
  // Update signer info
  updateSigners?: Array<{
    signerId: string;
    name?: string;
    email?: string;
  }>;

  // Add new signers
  addSigners?: Array<{
    name: string;
    email: string;
    role?: string;
    order?: number;
    signingGroup?: number;
  }>;

  // Remove signers (only pending ones)
  removeSignerIds?: string[];

  // Add fields
  addFields?: Array<{
    documentId: string;
    signerId?: string;
    type: 'signature' | 'initial' | 'date' | 'text' | 'checkbox';
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required?: boolean;
  }>;

  // Remove fields
  removeFieldIds?: string[];
}

/**
 * Correct (modify) a sent envelope that hasn't been completed.
 * - Voids outstanding tokens
 * - Applies corrections
 * - Generates new tokens for affected signers
 * - Signers who already completed are NOT affected
 */
export async function correctEnvelope(
  envelopeId: string,
  corrections: EnvelopeCorrection,
): Promise<void> {
  const db = getDb();

  // Verify envelope exists and is correctable
  const [envelope] = await db
    .select()
    .from(envelopes)
    .where(eq(envelopes.id, envelopeId));

  if (!envelope) throw new Error(`Envelope ${envelopeId} not found`);
  if (envelope.status === 'completed' || envelope.status === 'voided') {
    throw new Error(`Cannot correct envelope with status: ${envelope.status}`);
  }

  const changes: Record<string, unknown> = {};

  // 1. Update signers
  if (corrections.updateSigners) {
    for (const update of corrections.updateSigners) {
      const updateValues: Record<string, string> = {};
      if (update.name) updateValues.name = update.name;
      if (update.email) updateValues.email = update.email;

      if (Object.keys(updateValues).length > 0) {
        await db
          .update(signers)
          .set(updateValues)
          .where(eq(signers.id, update.signerId));
        changes[`updated_signer_${update.signerId}`] = updateValues;
      }
    }
  }

  // 2. Add new signers
  if (corrections.addSigners && corrections.addSigners.length > 0) {
    const newSigners = corrections.addSigners.map((s, idx) => ({
      tenantId: envelope.tenantId,
      id: uuidv4(),
      envelopeId,
      name: s.name,
      email: s.email,
      role: s.role ?? 'signer',
      order: s.order ?? 100 + idx,
      signingGroup: s.signingGroup,
      status: 'pending',
    }));

    await db.insert(signers).values(newSigners);
    changes.added_signers = newSigners.map((s) => s.email);
  }

  // 3. Remove signers (only pending)
  if (corrections.removeSignerIds && corrections.removeSignerIds.length > 0) {
    for (const signerId of corrections.removeSignerIds) {
      // Check signer is pending
      const [signer] = await db.select().from(signers).where(eq(signers.id, signerId));
      if (signer && (signer.status === 'pending' || signer.status === 'sent')) {
        // Remove associated fields first
        await db.delete(fields).where(eq(fields.signerId, signerId));
        await db.delete(signers).where(eq(signers.id, signerId));
        changes[`removed_signer_${signerId}`] = signer.email;
      }
    }
  }

  // 4. Add fields
  if (corrections.addFields && corrections.addFields.length > 0) {
    const newFields = corrections.addFields.map((f) => ({
      tenantId: envelope.tenantId,
      id: uuidv4(),
      envelopeId,
      documentId: f.documentId,
      signerId: f.signerId,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      required: f.required ?? true,
    }));

    await db.insert(fields).values(newFields);
    changes.added_fields = newFields.length;
  }

  // 5. Remove fields
  if (corrections.removeFieldIds && corrections.removeFieldIds.length > 0) {
    for (const fieldId of corrections.removeFieldIds) {
      await db.delete(fields).where(eq(fields.id, fieldId));
    }
    changes.removed_fields = corrections.removeFieldIds.length;
  }

  // 6. Void outstanding tokens and regenerate for pending signers
  const pendingSigners = await db
    .select()
    .from(signers)
    .where(eq(signers.envelopeId, envelopeId));

  for (const signer of pendingSigners) {
    if (signer.status === 'pending' || signer.status === 'sent') {
      await voidToken(signer.id);
      await assignToken(signer.id);
    }
  }

  // Update envelope
  await db
    .update(envelopes)
    .set({ updatedAt: new Date() })
    .where(eq(envelopes.id, envelopeId));

  // Log audit event
  await logEvent({
    envelopeId,
    eventType: 'corrected',
    eventData: changes,
  });
}
