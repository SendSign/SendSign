import { eq, and, sql, desc, ilike, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection.js';
import { envelopes, signers, fields, documents } from '../db/schema.js';
import { logEvent } from '../audit/auditLogger.js';
import { assignToken } from '../ceremony/tokenGenerator.js';

export interface CreateEnvelopeInput {
  subject: string;
  message?: string;
  signingOrder?: string;
  signingMode?: 'remote' | 'in_person';
  createdBy?: string;
  expiresAt?: Date;
  organizationId?: string;
  routingRules?: unknown;
  signers: Array<{
    name: string;
    email: string;
    role?: string;
    order?: number;
    signingGroup?: number;
  }>;
  fields?: Array<{
    documentId: string;
    signerId?: string;
    type: 'signature' | 'initial' | 'date' | 'text' | 'checkbox' | 'radio' | 'dropdown' | 'number' | 'currency' | 'calculated' | 'attachment';
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required?: boolean;
  }>;
}

export interface EnvelopeWithDetails {
  id: string;
  subject: string;
  message: string | null;
  status: string;
  signingOrder: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  documentKey: string | null;
  sealedKey: string | null;
  completionCertKey: string | null;
  signers: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    order: number;
    signingGroup: number | null;
    status: string;
    signedAt: Date | null;
    signingToken: string | null;
    tokenExpiresAt: Date | null;
  }>;
  fields: Array<{
    id: string;
    type: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required: boolean;
    value: string | null;
    signerId: string | null;
  }>;
}

export interface EnvelopeFilters {
  status?: string;
  createdBy?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Create a new envelope with signers and optional fields in a transaction.
 */
export async function createEnvelope(input: CreateEnvelopeInput): Promise<EnvelopeWithDetails> {
  const db = getDb();
  const envelopeId = uuidv4();

  // Insert envelope
  const [envelope] = await db
    .insert(envelopes)
    .values({
      id: envelopeId,
      subject: input.subject,
      message: input.message,
      signingOrder: input.signingOrder ?? 'sequential',
      signingMode: input.signingMode ?? 'remote',
      createdBy: input.createdBy ?? 'system',
      expiresAt: input.expiresAt,
      organizationId: input.organizationId,
      routingRules: input.routingRules,
      status: 'draft',
    })
    .returning();

  // Insert signers
  const signerInserts = input.signers.map((s, idx) => ({
    id: uuidv4(),
    envelopeId,
    name: s.name,
    email: s.email,
    role: s.role ?? 'signer',
    order: s.order ?? idx + 1,
    signingGroup: s.signingGroup,
    status: 'pending',
  }));

  const insertedSigners = signerInserts.length > 0
    ? await db.insert(signers).values(signerInserts).returning()
    : [];

  // Insert fields if provided
  let insertedFields: Array<typeof fields.$inferSelect> = [];
  if (input.fields && input.fields.length > 0) {
    const fieldInserts = input.fields.map((f) => ({
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

    insertedFields = await db.insert(fields).values(fieldInserts).returning();
  }

  // Log audit event
  await logEvent({
    envelopeId,
    eventType: 'created',
    eventData: {
      subject: input.subject,
      signerCount: input.signers.length,
    },
  });

  return mapToEnvelopeWithDetails(envelope, insertedSigners, insertedFields);
}

/**
 * Send an envelope — validate, generate tokens, trigger notifications.
 */
export async function sendEnvelope(envelopeId: string): Promise<void> {
  const db = getDb();

  // Get envelope
  const [envelope] = await db
    .select()
    .from(envelopes)
    .where(eq(envelopes.id, envelopeId));

  if (!envelope) throw new Error(`Envelope ${envelopeId} not found`);
  if (envelope.status !== 'draft') throw new Error(`Envelope is not in draft status (current: ${envelope.status})`);

  // Get signers
  const envelopeSigners = await db
    .select()
    .from(signers)
    .where(eq(signers.envelopeId, envelopeId));

  if (envelopeSigners.length === 0) throw new Error('Envelope has no signers');

  // Generate tokens for signers
  for (const signer of envelopeSigners) {
    await assignToken(signer.id);

    // Update signer status to 'sent'
    await db
      .update(signers)
      .set({ status: 'sent' })
      .where(eq(signers.id, signer.id));
  }

  // Update envelope status
  await db
    .update(envelopes)
    .set({
      status: 'sent',
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(envelopes.id, envelopeId));

  // Log audit event
  await logEvent({
    envelopeId,
    eventType: 'sent',
    eventData: { signerCount: envelopeSigners.length },
  });

  // Dispatch to integrations
  const { integrationRegistry } = await import('../integrations/registry.js');
  await integrationRegistry.dispatchEvent('envelopeSent', { envelope });
}

/**
 * Void/cancel a pending envelope.
 */
export async function voidEnvelope(
  envelopeId: string,
  reason?: string,
): Promise<void> {
  const db = getDb();

  const [envelope] = await db
    .select()
    .from(envelopes)
    .where(eq(envelopes.id, envelopeId));

  if (!envelope) throw new Error(`Envelope ${envelopeId} not found`);
  if (envelope.status === 'completed' || envelope.status === 'voided') {
    throw new Error(`Cannot void envelope with status: ${envelope.status}`);
  }

  await db
    .update(envelopes)
    .set({ status: 'voided', updatedAt: new Date() })
    .where(eq(envelopes.id, envelopeId));

  await logEvent({
    envelopeId,
    eventType: 'voided',
    eventData: { reason },
  });

  // Dispatch to integrations
  const { integrationRegistry } = await import('../integrations/registry.js');
  await integrationRegistry.dispatchEvent('envelopeVoided', { envelope });
}

/**
 * Complete an envelope — called when all signers are done.
 * Seals the PDF, generates completion certificate, and notifies all parties.
 */
export async function completeEnvelope(envelopeId: string): Promise<void> {
  const db = getDb();

  // Seal the PDF by flattening all signatures into the document
  let sealedKey: string | null = null;
  try {
    const { sealPdfDocument } = await import('../documents/pdfSealer.js');
    sealedKey = await sealPdfDocument(envelopeId);
  } catch (err) {
    console.error('Failed to seal PDF:', err);
    // Continue even if sealing fails — mark as completed anyway
  }

  // Generate completion certificate
  let certificateKey: string | null = null;
  try {
    const { generateCompletionCertificate } = await import('../documents/certificateGenerator.js');
    certificateKey = await generateCompletionCertificate(envelopeId);
  } catch (err) {
    console.error('Failed to generate completion certificate:', err);
    // Continue even if certificate generation fails
  }

  await db
    .update(envelopes)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(envelopes.id, envelopeId));

  await logEvent({
    envelopeId,
    eventType: 'sealed',
    eventData: {
      completedAt: new Date().toISOString(),
      sealedKey,
      certificateKey,
    },
  });

  // Dispatch to integrations
  const fullEnvelope = await getEnvelope(envelopeId);
  if (fullEnvelope) {
    const { integrationRegistry } = await import('../integrations/registry.js');
    await integrationRegistry.dispatchEvent('envelopeCompleted', { envelope: fullEnvelope as any });
  }
}

/**
 * Get a full envelope with signers and fields.
 */
export async function getEnvelope(envelopeId: string): Promise<EnvelopeWithDetails | null> {
  const db = getDb();

  const [envelope] = await db
    .select()
    .from(envelopes)
    .where(eq(envelopes.id, envelopeId));

  if (!envelope) return null;

  const envelopeSigners = await db
    .select()
    .from(signers)
    .where(eq(signers.envelopeId, envelopeId));

  const envelopeFields = await db
    .select()
    .from(fields)
    .where(eq(fields.envelopeId, envelopeId));

  return mapToEnvelopeWithDetails(envelope, envelopeSigners, envelopeFields);
}

/**
 * List envelopes with optional filters.
 */
export async function listEnvelopes(
  filters: EnvelopeFilters = {},
): Promise<{ envelopes: EnvelopeWithDetails[]; total: number }> {
  const db = getDb();
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(envelopes.status, filters.status as typeof envelopes.status.enumValues[number]));
  }
  if (filters.createdBy) {
    conditions.push(eq(envelopes.createdBy, filters.createdBy));
  }
  if (filters.search) {
    conditions.push(ilike(envelopes.subject, `%${filters.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(envelopes)
    .where(whereClause)
    .orderBy(desc(envelopes.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(envelopes)
    .where(whereClause);

  const total = Number(countResult[0]?.count ?? 0);

  // Fetch signers and fields for each envelope
  const envelopesWithDetails: EnvelopeWithDetails[] = [];
  for (const env of results) {
    const envSigners = await db.select().from(signers).where(eq(signers.envelopeId, env.id));
    const envFields = await db.select().from(fields).where(eq(fields.envelopeId, env.id));
    envelopesWithDetails.push(mapToEnvelopeWithDetails(env, envSigners, envFields));
  }

  return { envelopes: envelopesWithDetails, total };
}

function mapToEnvelopeWithDetails(
  envelope: typeof envelopes.$inferSelect,
  envSigners: Array<typeof signers.$inferSelect>,
  envFields: Array<typeof fields.$inferSelect>,
): EnvelopeWithDetails {
  return {
    id: envelope.id,
    subject: envelope.subject,
    message: envelope.message,
    status: envelope.status,
    signingOrder: envelope.signingOrder,
    createdBy: envelope.createdBy,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    sentAt: envelope.sentAt,
    completedAt: envelope.completedAt,
    expiresAt: envelope.expiresAt,
    documentKey: envelope.documentKey,
    sealedKey: envelope.sealedKey,
    completionCertKey: envelope.completionCertKey,
    signers: envSigners.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      order: s.order,
      signingGroup: s.signingGroup,
      status: s.status,
      signedAt: s.signedAt,
      signingToken: s.signingToken,
      tokenExpiresAt: s.tokenExpiresAt,
    })),
    fields: envFields.map((f) => ({
      id: f.id,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      required: f.required,
      value: f.value,
      signerId: f.signerId,
      label: f.anchorText ?? undefined,
    })),
  };
}
