import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  createEnvelope,
  sendEnvelope,
  voidEnvelope,
  getEnvelope,
  listEnvelopes,
  completeEnvelope,
} from '../../workflow/envelopeManager.js';
import { correctEnvelope } from '../../workflow/envelopeCorrector.js';
import { uploadDocument, downloadDocument } from '../../storage/documentStore.js';
import { hashDocument } from '../../crypto/hasher.js';
import { ensurePdf } from '../../documents/converter.js';
import { getDb } from '../../db/connection.js';
import { documents, envelopes as envelopesTable, signers as signersTable, fields as fieldsTable, folders, envelopeFolders, templates, auditEvents as auditEventsTable } from '../../db/schema.js';
import { v4 as uuidv4 } from 'uuid';
import { enforceEnvelopeLimit, enforceVerificationLevel } from '../middleware/planEnforcement.js';
import { getOrganizationId } from '../middleware/auth.js';
import { requireRole, requireOwnership } from '../middleware/rbac.js';
import { eq, and, or, inArray } from 'drizzle-orm';
import { logEvent } from '../../audit/auditLogger.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Middleware to parse JSON string fields from multipart/form-data requests.
 * When sending multipart forms, structured fields like `signers` arrive as
 * JSON strings (e.g. '[{"name":"Alice","email":"alice@example.com"}]').
 * This middleware detects the content type and JSON-parses those fields
 * so that downstream zod validation sees actual objects/arrays.
 */
function parseMultipartJsonFields(...fieldNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) {
      return next();
    }

    for (const field of fieldNames) {
      const value = req.body[field];
      if (typeof value === 'string') {
        try {
          req.body[field] = JSON.parse(value);
        } catch {
          // Leave as-is — zod validation will catch the type mismatch
        }
      }
    }
    next();
  };
}

// ─── Schemas ─────────────────────────────────────────────────────────

const createEnvelopeSchema = z.object({
  subject: z.string().min(1),
  message: z.string().optional(),
  signingOrder: z.enum(['sequential', 'parallel']).default('sequential'),
  expiresAt: z.string().datetime().optional(),
  templateId: z.string().uuid().optional(),
  signers: z.array(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      role: z.string().default('signer'),
      order: z.number().int().positive().optional(),
      signingGroup: z.number().int().optional(),
    }),
  ).min(1),
});

const voidEnvelopeSchema = z.object({
  reason: z.string().optional(),
});

const correctEnvelopeSchema = z.object({
  updateSigners: z.array(
    z.object({
      signerId: z.string().uuid(),
      name: z.string().optional(),
      email: z.string().email().optional(),
    }),
  ).optional(),
  addSigners: z.array(
    z.object({
      name: z.string(),
      email: z.string().email(),
      role: z.string().optional(),
      order: z.number().int().optional(),
    }),
  ).optional(),
  removeSignerIds: z.array(z.string().uuid()).optional(),
  addFields: z.array(
    z.object({
      documentId: z.string().uuid(),
      signerId: z.string().uuid().optional(),
      type: z.enum(['signature', 'initial', 'date', 'text', 'checkbox']),
      page: z.number().int().min(1),
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      width: z.number().min(0).max(100),
      height: z.number().min(0).max(100),
      required: z.boolean().optional(),
    }),
  ).optional(),
  removeFieldIds: z.array(z.string().uuid()).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────

/**
 * POST /api/envelopes
 * Create a new envelope with optional document upload.
 */
router.post('/', upload.array('documents', 10), parseMultipartJsonFields('signers'), requireRole('admin', 'sender'), enforceEnvelopeLimit, enforceVerificationLevel, validate(createEnvelopeSchema), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const db = getDb();
  const organizationId = getOrganizationId(req);

  // Create envelope (scoped to organization if multi-tenant)
  const envelope = await createEnvelope({
    subject: req.body.subject,
    message: req.body.message,
    signingOrder: req.body.signingOrder,
    signers: req.body.signers,
    expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
    organizationId: organizationId ?? undefined,
    createdBy: req.user?.id || req.user?.email || 'system',
  });

  // Upload documents if provided
  const conversionWarnings: string[] = [];

  if (files && files.length > 0) {
    let primaryStoragePath: string | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const docId = uuidv4();

      // Convert non-PDF files (DOCX, DOC, etc.) to PDF via LibreOffice.
      // If LibreOffice isn't available, the raw file is stored and
      // a conversionError is flagged so the signing UI can report it.
      const conversion = await ensurePdf(file.buffer, file.originalname, file.mimetype);

      if (conversion.conversionError) {
        conversionWarnings.push(
          `${file.originalname}: ${conversion.conversionError}`,
        );
      }

      // Upload the (possibly converted) buffer to storage
      const storagePath = await uploadDocument(conversion.buffer, {
        filename: conversion.filename,
        contentType: conversion.contentType,
        envelopeId: envelope.id,
      });

      // First file becomes the primary document for the envelope
      if (i === 0) {
        primaryStoragePath = storagePath;
      }

      // Save document record in the documents table
      await db.insert(documents).values({
        id: docId,
        envelopeId: envelope.id,
        filename: conversion.filename,
        contentType: conversion.contentType,
        storagePath,
        documentHash: hashDocument(conversion.buffer),
        order: i,
      });
    }

    // Set the envelope's documentKey so that retention, sealing,
    // and API responses include the primary document reference
    if (primaryStoragePath) {
      await db
        .update(envelopesTable)
        .set({ documentKey: primaryStoragePath })
        .where(eq(envelopesTable.id, envelope.id));

      envelope.documentKey = primaryStoragePath;
    }
  }

  // If a templateId was provided, copy all field positions from the template
  // onto this envelope's first document and signers.
  if (req.body.templateId) {
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, req.body.templateId))
      .limit(1);

    if (template) {
      const templateFields = template.fieldConfig as Array<{
        type: string;
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
        required?: boolean;
        signerRole?: string;
        label?: string;
        options?: unknown;
        anchorText?: string;
      }>;

      if (Array.isArray(templateFields) && templateFields.length > 0) {
        // Find the first document for this envelope to attach fields to
        const [firstDoc] = await db
          .select()
          .from(documents)
          .where(eq(documents.envelopeId, envelope.id))
          .orderBy(documents.order)
          .limit(1);

        // Build a role→signer map so template fields can be assigned
        // to the correct signer based on the signerRole in the template.
        const signersByRole = new Map<string, string>();
        for (const s of envelope.signers) {
          signersByRole.set(s.role, s.id);
        }
        // Fallback: first signer if role doesn't match
        const fallbackSignerId = envelope.signers[0]?.id ?? null;

        for (const tf of templateFields) {
          const signerId =
            (tf.signerRole ? signersByRole.get(tf.signerRole) : null) ??
            fallbackSignerId;

          await db.insert(fieldsTable).values({
            id: uuidv4(),
            envelopeId: envelope.id,
            documentId: firstDoc?.id ?? envelope.id, // best-effort if no document yet
            signerId,
            type: tf.type as 'signature' | 'initial' | 'date' | 'text' | 'checkbox',
            page: tf.page,
            x: tf.x,
            y: tf.y,
            width: tf.width,
            height: tf.height,
            required: tf.required ?? true,
            anchorText: tf.anchorText ?? null,
            options: tf.options ?? null,
          });
        }
      }
    }

    // Re-fetch the envelope to include the newly created fields
    const { getEnvelope: getFullEnvelope } = await import('../../workflow/envelopeManager.js');
    const fullEnvelope = await getFullEnvelope(envelope.id);
    if (fullEnvelope) {
      Object.assign(envelope, fullEnvelope);
    }
  }

  const response: { success: boolean; data: typeof envelope; warnings?: string[] } = {
    success: true,
    data: envelope,
  };
  if (conversionWarnings.length > 0) {
    response.warnings = conversionWarnings;
  }

  res.status(201).json(response);
});

/**
 * GET /api/envelopes/:id
 * Get a specific envelope.
 */
router.get('/:id', async (req, res) => {
  const envelope = await getEnvelope(req.params.id);

  if (!envelope) {
    res.status(404).json({ success: false, error: 'Envelope not found' });
    return;
  }

  res.json({ success: true, data: envelope });
});

/**
 * GET /api/envelopes/:id/document
 * Serve the PDF document for an envelope (requires API key auth via the
 * parent router). Used by the prepare page to render the PDF for field
 * placement.
 */
router.get('/:id/document', async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id;

  try {
    // Try the documents table first
    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.envelopeId, envelopeId))
      .orderBy(documents.order)
      .limit(1);

    if (docs.length > 0) {
      const doc = docs[0];
      const pdfBuffer = await downloadDocument(doc.storagePath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
      return;
    }

    // Fall back to envelope.documentKey
    const [envelope] = await db
      .select()
      .from(envelopesTable)
      .where(eq(envelopesTable.id, envelopeId))
      .limit(1);

    if (envelope?.documentKey) {
      const pdfBuffer = await downloadDocument(envelope.documentKey);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="document.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
      return;
    }

    res.status(404).json({ success: false, error: 'No documents found for this envelope' });
  } catch (err) {
    console.error('Failed to serve document:', err);
    res.status(500).json({ success: false, error: 'Failed to load document' });
  }
});

/**
 * GET /api/envelopes/:id/signed-document
 * Download the sealed (signed) PDF with all signatures embedded.
 */
router.get('/:id/signed-document', requireRole('admin', 'sender', 'viewer'), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  try {
    const [envelope] = await db
      .select()
      .from(envelopesTable)
      .where(eq(envelopesTable.id, envelopeId))
      .limit(1);

    if (!envelope) {
      res.status(404).json({ success: false, error: 'Envelope not found' });
      return;
    }

    if (envelope.status !== 'completed') {
      res.status(400).json({
        success: false,
        error: 'Envelope is not yet completed. Signed document is only available after all signers finish.',
      });
      return;
    }

    if (!envelope.sealedKey) {
      res.status(404).json({
        success: false,
        error: 'Sealed document not found. The PDF may still be processing.',
      });
      return;
    }

    const pdfBuffer = await downloadDocument(envelope.sealedKey);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="signed_${envelope.subject || 'document'}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Failed to serve signed document:', err);
    res.status(500).json({ success: false, error: 'Failed to download signed document' });
  }
});

/**
 * GET /api/envelopes/:id/certificate
 * Download the completion certificate with audit trail.
 */
router.get('/:id/certificate', requireRole('admin', 'sender', 'viewer'), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  try {
    const [envelope] = await db
      .select()
      .from(envelopesTable)
      .where(eq(envelopesTable.id, envelopeId))
      .limit(1);

    if (!envelope) {
      res.status(404).json({ success: false, error: 'Envelope not found' });
      return;
    }

    if (envelope.status !== 'completed') {
      res.status(400).json({
        success: false,
        error: 'Envelope is not yet completed. Certificate is only available after all signers finish.',
      });
      return;
    }

    if (!envelope.completionCertKey) {
      res.status(404).json({
        success: false,
        error: 'Completion certificate not found. It may still be generating.',
      });
      return;
    }

    const pdfBuffer = await downloadDocument(envelope.completionCertKey);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate_${envelope.subject || 'document'}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Failed to serve certificate:', err);
    res.status(500).json({ success: false, error: 'Failed to download certificate' });
  }
});

/**
 * GET /api/envelopes
 * List envelopes with optional filters.
 */
router.get('/', async (req, res) => {
  const result = await listEnvelopes({
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    createdBy: typeof req.query.createdBy === 'string' ? req.query.createdBy : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    limit: typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined,
    offset: typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : undefined,
  });

  res.json({ success: true, data: result });
});

// ─── Signer management (prepare page) ───────────────────────────────

const addSignerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  role: z.enum(['signer', 'cc', 'witness']).default('signer'),
});

/**
 * POST /api/envelopes/:id/signers
 * Add a new signer to an existing envelope (must be in draft or sent status).
 */
router.post('/:id/signers', requireRole('admin', 'sender'), validate(addSignerSchema), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  try {
    // Check envelope exists and is editable
    const [envelope] = await db
      .select()
      .from(envelopesTable)
      .where(eq(envelopesTable.id, envelopeId))
      .limit(1);

    if (!envelope) {
      res.status(404).json({ success: false, error: 'Envelope not found' });
      return;
    }

    if (envelope.status !== 'draft' && envelope.status !== 'sent') {
      res.status(400).json({
        success: false,
        error: `Cannot add signers to envelope with status: ${envelope.status}`,
      });
      return;
    }

    // Create the new signer
    const existingSigners = await db.select().from(signersTable).where(eq(signersTable.envelopeId, envelopeId));
    const [newSigner] = await db
      .insert(signersTable)
      .values({
        envelopeId,
        name: req.body.name,
        email: req.body.email,
        role: req.body.role || 'signer',
        status: envelope.status === 'sent' ? 'pending' : 'draft',
        order: existingSigners.length + 1,
      })
      .returning();

    // Log audit event
    await logEvent({
      envelopeId,
      eventType: 'created',
      eventData: { signerName: newSigner.name, signerEmail: newSigner.email },
    });

    res.status(201).json({ success: true, data: newSigner });
  } catch (err) {
    console.error('Failed to add signer:', err);
    res.status(500).json({ success: false, error: 'Failed to add signer' });
  }
});

/**
 * PUT /api/envelopes/:id/signers/:signerId
 * Update a signer's name or email.
 */
const updateSignerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

router.put('/:id/signers/:signerId', requireRole('admin', 'sender'), validate(updateSignerSchema), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;
  const signerId = req.params.signerId as string;

  try {
    const [envelope] = await db.select().from(envelopesTable).where(eq(envelopesTable.id, envelopeId)).limit(1);
    if (!envelope) { res.status(404).json({ success: false, error: 'Envelope not found' }); return; }
    if (envelope.status !== 'draft' && envelope.status !== 'sent') {
      res.status(400).json({ success: false, error: `Cannot edit signers on ${envelope.status} envelope` }); return;
    }

    const [signer] = await db.select().from(signersTable).where(eq(signersTable.id, signerId)).limit(1);
    if (!signer || signer.envelopeId !== envelopeId) {
      res.status(404).json({ success: false, error: 'Signer not found' }); return;
    }

    const updates: Record<string, unknown> = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.email) updates.email = req.body.email;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' }); return;
    }

    const [updated] = await db.update(signersTable).set(updates).where(eq(signersTable.id, signerId)).returning();

    await logEvent({
      envelopeId,
      eventType: 'corrected',
      eventData: { action: 'update_signer', signerId, updates },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Failed to update signer:', err);
    res.status(500).json({ success: false, error: 'Failed to update signer' });
  }
});

/**
 * DELETE /api/envelopes/:id/signers/:signerId
 * Remove a signer and all their fields from an envelope.
 */
router.delete('/:id/signers/:signerId', requireRole('admin', 'sender'), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;
  const signerId = req.params.signerId as string;

  try {
    const [envelope] = await db.select().from(envelopesTable).where(eq(envelopesTable.id, envelopeId)).limit(1);
    if (!envelope) { res.status(404).json({ success: false, error: 'Envelope not found' }); return; }
    if (envelope.status !== 'draft' && envelope.status !== 'sent') {
      res.status(400).json({ success: false, error: `Cannot remove signers from ${envelope.status} envelope` }); return;
    }

    const [signer] = await db.select().from(signersTable).where(eq(signersTable.id, signerId)).limit(1);
    if (!signer || signer.envelopeId !== envelopeId) {
      res.status(404).json({ success: false, error: 'Signer not found' }); return;
    }

    // Check we're not removing the last signer
    const allSigners = await db.select().from(signersTable).where(eq(signersTable.envelopeId, envelopeId));
    if (allSigners.length <= 1) {
      res.status(400).json({ success: false, error: 'Cannot remove the last signer' }); return;
    }

    // Delete all fields assigned to this signer
    await db.delete(fieldsTable).where(
      and(eq(fieldsTable.envelopeId, envelopeId), eq(fieldsTable.signerId, signerId))
    );

    // Delete the signer
    await db.delete(signersTable).where(eq(signersTable.id, signerId));

    await logEvent({
      envelopeId,
      eventType: 'corrected',
      eventData: { action: 'remove_signer', signerName: signer.name, signerEmail: signer.email },
    });

    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error('Failed to delete signer:', err);
    res.status(500).json({ success: false, error: 'Failed to delete signer' });
  }
});

/**
 * DELETE /api/envelopes/:id
 * Delete an envelope (only drafts and voided envelopes can be deleted).
 */
router.delete('/:id', requireRole('admin', 'sender'), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  try {
    const [envelope] = await db.select().from(envelopesTable).where(eq(envelopesTable.id, envelopeId)).limit(1);
    if (!envelope) { res.status(404).json({ success: false, error: 'Envelope not found' }); return; }

    // Only allow deleting drafts and voided envelopes
    if (envelope.status !== 'draft' && envelope.status !== 'voided') {
      res.status(400).json({
        success: false,
        error: `Cannot delete envelope with status "${envelope.status}". Only draft and voided envelopes can be deleted.`,
      }); return;
    }

    // Delete in order: fields → signers → documents → audit events → envelope
    await db.delete(fieldsTable).where(eq(fieldsTable.envelopeId, envelopeId));
    await db.delete(signersTable).where(eq(signersTable.envelopeId, envelopeId));
    await db.delete(documents).where(eq(documents.envelopeId, envelopeId));
    await db.delete(auditEventsTable).where(eq(auditEventsTable.envelopeId, envelopeId));
    await db.delete(envelopesTable).where(eq(envelopesTable.id, envelopeId));

    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error('Failed to delete envelope:', err);
    res.status(500).json({ success: false, error: 'Failed to delete envelope' });
  }
});

/**
 * POST /api/envelopes/:id/resend
 * Resend signing notifications to pending signers (regenerates expired tokens).
 */
router.post('/:id/resend', requireRole('admin', 'sender'), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  try {
    const [envelope] = await db.select().from(envelopesTable).where(eq(envelopesTable.id, envelopeId)).limit(1);
    if (!envelope) { res.status(404).json({ success: false, error: 'Envelope not found' }); return; }

    if (envelope.status !== 'sent' && envelope.status !== 'in_progress') {
      res.status(400).json({
        success: false,
        error: `Cannot resend notifications for envelope with status "${envelope.status}"`,
      }); return;
    }

    // Find pending signers and regenerate their tokens
    const pendingSigners = await db
      .select()
      .from(signersTable)
      .where(and(eq(signersTable.envelopeId, envelopeId), eq(signersTable.status, 'pending')));

    let resent = 0;
    for (const signer of pendingSigners) {
      // Regenerate token if expired or missing
      if (!signer.signingToken || (signer.tokenExpiresAt && new Date() > new Date(signer.tokenExpiresAt))) {
        const { assignToken } = await import('../../ceremony/tokenGenerator.js');
        await assignToken(signer.id);
      }
      resent++;
    }

    await logEvent({
      envelopeId,
      eventType: 'reminded',
      eventData: { action: 'resend', signersResent: resent },
    });

    res.json({ success: true, data: { resent } });
  } catch (err) {
    console.error('Failed to resend:', err);
    res.status(500).json({ success: false, error: 'Failed to resend notifications' });
  }
});

/**
 * POST /api/envelopes/:id/remind
 * Alias for /resend — matches command documentation.
 */
router.post('/:id/remind', requireRole('admin', 'sender'), async (req, res) => {
  // Forward to the resend handler by making it call the same logic
  const db = getDb();
  const envelopeId = req.params.id as string;

  try {
    const [envelope] = await db.select().from(envelopesTable).where(eq(envelopesTable.id, envelopeId)).limit(1);
    if (!envelope) { res.status(404).json({ success: false, error: 'Envelope not found' }); return; }

    if (envelope.status !== 'sent' && envelope.status !== 'in_progress') {
      res.status(400).json({ success: false, error: `Cannot send reminders for envelope with status "${envelope.status}"` }); return;
    }

    const pendingSigners = await db
      .select().from(signersTable)
      .where(and(eq(signersTable.envelopeId, envelopeId), eq(signersTable.status, 'pending')));

    let resent = 0;
    for (const signer of pendingSigners) {
      if (!signer.signingToken || (signer.tokenExpiresAt && new Date() > new Date(signer.tokenExpiresAt))) {
        const { assignToken } = await import('../../ceremony/tokenGenerator.js');
        await assignToken(signer.id);
      }
      resent++;
    }

    await logEvent({ envelopeId, eventType: 'reminded', eventData: { action: 'remind', signersResent: resent } });
    res.json({ success: true, data: { resent } });
  } catch (err) {
    console.error('Failed to send reminder:', err);
    res.status(500).json({ success: false, error: 'Failed to send reminder' });
  }
});

/**
 * POST /api/envelopes/:id/auto-place-fields
 * Automatically place signature fields on a document based on analysis.
 * This is designed for AI/MCP tool orchestration — it analyzes the PDF and places
 * signature, date, and name fields in sensible locations for each signer.
 */
router.post('/:id/auto-place-fields', requireRole('admin', 'sender'), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  try {
    const [envelope] = await db.select().from(envelopesTable).where(eq(envelopesTable.id, envelopeId)).limit(1);
    if (!envelope) { res.status(404).json({ success: false, error: 'Envelope not found' }); return; }
    if (envelope.status !== 'draft') {
      res.status(400).json({ success: false, error: 'Can only auto-place fields on draft envelopes' }); return;
    }

    // Get signers
    const envelopeSigners = await db.select().from(signersTable).where(eq(signersTable.envelopeId, envelopeId));
    if (envelopeSigners.length === 0) {
      res.status(400).json({ success: false, error: 'No signers on this envelope' }); return;
    }

    // Get the document to determine page count
    const [doc] = await db.select().from(documents).where(eq(documents.envelopeId, envelopeId)).orderBy(documents.order).limit(1);
    if (!doc) {
      res.status(400).json({ success: false, error: 'No document attached to this envelope' }); return;
    }

    const pageCount = doc.pageCount || 1;
    const lastPage = pageCount;

    // Auto-place strategy:
    // - Signature fields on the last page, stacked vertically from bottom
    // - Date field next to each signature
    // - Name field above each signature
    // Each signer gets a signature block: Name, Signature, Date
    const autoFields: Array<{
      type: string;
      signerId: string;
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      required: boolean;
      label: string;
    }> = [];

    const signerCount = envelopeSigners.filter((s) => s.role === 'signer').length;
    const blockHeight = 80; // pixels per signer block
    const startY = Math.max(500, 792 - (signerCount * (blockHeight + 20)) - 40);

    envelopeSigners
      .filter((s) => s.role === 'signer')
      .forEach((signer, index) => {
        const baseX = index % 2 === 0 ? 72 : 320; // Two columns if >2 signers
        const baseY = signerCount <= 2
          ? startY + index * (blockHeight + 20)
          : startY + Math.floor(index / 2) * (blockHeight + 20);

        // Name field
        autoFields.push({
          type: 'text',
          signerId: signer.id,
          page: lastPage,
          x: baseX,
          y: baseY,
          width: 200,
          height: 20,
          required: true,
          label: 'Full Name',
        });

        // Signature field
        autoFields.push({
          type: 'signature',
          signerId: signer.id,
          page: lastPage,
          x: baseX,
          y: baseY + 25,
          width: 200,
          height: 40,
          required: true,
          label: 'Signature',
        });

        // Date field
        autoFields.push({
          type: 'date',
          signerId: signer.id,
          page: lastPage,
          x: baseX,
          y: baseY + 70,
          width: 120,
          height: 20,
          required: true,
          label: 'Date',
        });
      });

    // Save fields to database
    if (autoFields.length > 0) {
      // Clear existing fields first
      await db.delete(fieldsTable).where(eq(fieldsTable.envelopeId, envelopeId));

      for (const field of autoFields) {
        await db.insert(fieldsTable).values({
          envelopeId,
          documentId: doc.id,
          signerId: field.signerId,
          type: field.type as 'signature' | 'initial' | 'date' | 'text' | 'checkbox' | 'radio' | 'dropdown' | 'number' | 'currency' | 'calculated' | 'attachment',
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          required: field.required,
          label: field.label,
        });
      }
    }

    await logEvent({
      envelopeId,
      eventType: 'corrected',
      eventData: { action: 'auto_place_fields', fieldCount: autoFields.length },
    });

    res.json({
      success: true,
      data: {
        fieldsPlaced: autoFields.length,
        signerBlocks: envelopeSigners.filter((s) => s.role === 'signer').length,
        page: lastPage,
        fields: autoFields,
      },
    });
  } catch (err) {
    console.error('Failed to auto-place fields:', err);
    res.status(500).json({ success: false, error: 'Failed to auto-place fields' });
  }
});

/**
 * PATCH /api/envelopes/:id
 * Update envelope metadata (subject, message, expiresAt). Only for draft envelopes.
 */
const patchEnvelopeSchema = z.object({
  subject: z.string().min(1).optional(),
  message: z.string().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

router.patch('/:id', requireRole('admin', 'sender'), validate(patchEnvelopeSchema), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  try {
    const [envelope] = await db.select().from(envelopesTable).where(eq(envelopesTable.id, envelopeId)).limit(1);
    if (!envelope) { res.status(404).json({ success: false, error: 'Envelope not found' }); return; }
    if (envelope.status !== 'draft') {
      res.status(400).json({ success: false, error: 'Can only edit metadata of draft envelopes' }); return;
    }

    const updates: Record<string, unknown> = {};
    if (req.body.subject !== undefined) updates.subject = req.body.subject;
    if (req.body.message !== undefined) updates.message = req.body.message;
    if (req.body.expiresAt !== undefined) updates.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' }); return;
    }

    const [updated] = await db.update(envelopesTable).set(updates).where(eq(envelopesTable.id, envelopeId)).returning();

    await logEvent({
      envelopeId,
      eventType: 'corrected',
      eventData: { action: 'update_metadata', updates },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Failed to update envelope:', err);
    res.status(500).json({ success: false, error: 'Failed to update envelope' });
  }
});

/**
 * GET /api/envelopes/:id/audit
 * Get the full audit trail for an envelope.
 */
router.get('/:id/audit', requireRole('admin', 'sender'), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  try {
    const [envelope] = await db.select().from(envelopesTable).where(eq(envelopesTable.id, envelopeId)).limit(1);
    if (!envelope) { res.status(404).json({ success: false, error: 'Envelope not found' }); return; }

    const events = await db
      .select()
      .from(auditEventsTable)
      .where(eq(auditEventsTable.envelopeId, envelopeId))
      .orderBy(auditEventsTable.createdAt);

    // Enrich with signer names
    const signerList = await db.select().from(signersTable).where(eq(signersTable.envelopeId, envelopeId));
    const signerMap = new Map(signerList.map((s) => [s.id, s]));

    const enriched = events.map((e) => ({
      ...e,
      signerName: e.signerId ? signerMap.get(e.signerId)?.name || null : null,
      signerEmail: e.signerId ? signerMap.get(e.signerId)?.email || null : null,
    }));

    res.json({ success: true, data: { envelope: { id: envelope.id, subject: envelope.subject, status: envelope.status }, events: enriched } });
  } catch (err) {
    console.error('Failed to get audit trail:', err);
    res.status(500).json({ success: false, error: 'Failed to get audit trail' });
  }
});

// ─── Field management (prepare page) ────────────────────────────────

const bulkFieldSchema = z.object({
  fields: z.array(
    z.object({
      type: z.enum(['signature', 'initial', 'date', 'text', 'checkbox', 'radio', 'dropdown', 'number', 'currency', 'calculated', 'attachment']),
      signerId: z.string().uuid().nullable().optional(),
      page: z.number().int().min(1),
      x: z.number().min(0),
      y: z.number().min(0),
      width: z.number().min(0),
      height: z.number().min(0),
      required: z.boolean().default(true),
      label: z.string().optional(),
    }),
  ),
});

const updateFieldSchema = z.object({
  signerId: z.string().uuid().nullable().optional(),
  page: z.number().int().min(1).optional(),
  x: z.number().min(0).optional(),
  y: z.number().min(0).optional(),
  width: z.number().min(0).optional(),
  height: z.number().min(0).optional(),
  required: z.boolean().optional(),
  label: z.string().optional(),
});

/**
 * POST /api/envelopes/:id/fields
 * Bulk save fields — replaces all existing fields for this envelope.
 */
router.post('/:id/fields', requireRole('admin', 'sender'), validate(bulkFieldSchema), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  // Verify envelope exists
  const envelope = await getEnvelope(envelopeId);
  if (!envelope) {
    res.status(404).json({ success: false, error: 'Envelope not found' });
    return;
  }

  // Get first document to attach fields to
  const [firstDoc] = await db
    .select()
    .from(documents)
    .where(eq(documents.envelopeId, envelopeId))
    .orderBy(documents.order)
    .limit(1);

  if (!firstDoc) {
    // If no documents table record, create one from the envelope's documentKey
    // so fields have a valid documentId reference
    res.status(400).json({
      success: false,
      error: 'No document found for this envelope. Upload a document first.',
    });
    return;
  }
  const documentId = firstDoc.id;

  // Delete existing fields for this envelope
  await db.delete(fieldsTable).where(eq(fieldsTable.envelopeId, envelopeId));

  // Insert new fields
  const insertedFields = [];
  for (const f of req.body.fields) {
    const [inserted] = await db
      .insert(fieldsTable)
      .values({
        id: uuidv4(),
        envelopeId,
        documentId,
        signerId: f.signerId ?? null,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        required: f.required ?? true,
        anchorText: f.label ?? null,
      })
      .returning();
    insertedFields.push(inserted);
  }

  res.json({ success: true, data: insertedFields });
});

/**
 * GET /api/envelopes/:id/fields
 * Return all fields for this envelope.
 */
router.get('/:id/fields', async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  const envelopeFields = await db
    .select()
    .from(fieldsTable)
    .where(eq(fieldsTable.envelopeId, envelopeId));

  res.json({ success: true, data: envelopeFields });
});

/**
 * PUT /api/envelopes/:id/fields/:fieldId
 * Update a single field.
 */
router.put('/:id/fields/:fieldId', requireRole('admin', 'sender'), validate(updateFieldSchema), async (req, res) => {
  const db = getDb();
  const fieldId = req.params.fieldId as string;

  const [existing] = await db
    .select()
    .from(fieldsTable)
    .where(eq(fieldsTable.id, fieldId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ success: false, error: 'Field not found' });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (req.body.signerId !== undefined) updates.signerId = req.body.signerId;
  if (req.body.page !== undefined) updates.page = req.body.page;
  if (req.body.x !== undefined) updates.x = req.body.x;
  if (req.body.y !== undefined) updates.y = req.body.y;
  if (req.body.width !== undefined) updates.width = req.body.width;
  if (req.body.height !== undefined) updates.height = req.body.height;
  if (req.body.required !== undefined) updates.required = req.body.required;
  if (req.body.label !== undefined) updates.anchorText = req.body.label;

  await db.update(fieldsTable).set(updates).where(eq(fieldsTable.id, fieldId));

  const [updated] = await db.select().from(fieldsTable).where(eq(fieldsTable.id, fieldId));
  res.json({ success: true, data: updated });
});

/**
 * DELETE /api/envelopes/:id/fields/:fieldId
 * Delete a single field.
 */
router.delete('/:id/fields/:fieldId', requireRole('admin', 'sender'), async (req, res) => {
  const db = getDb();
  const fieldId = req.params.fieldId as string;
  await db.delete(fieldsTable).where(eq(fieldsTable.id, fieldId));
  res.json({ success: true, data: { message: 'Field deleted' } });
});

/**
 * POST /api/envelopes/:id/send
 * Send an envelope to signers. Validates that every signer has at least
 * one signature field before sending.
 */
router.post('/:id/send', requireRole('admin', 'sender'), requireOwnership('id'), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.id as string;

  // Validate: every signer must have at least one signature field
  const envelope = await getEnvelope(envelopeId);
  if (!envelope) {
    res.status(404).json({ success: false, error: 'Envelope not found' });
    return;
  }

  const envelopeFields = await db
    .select()
    .from(fieldsTable)
    .where(eq(fieldsTable.envelopeId, envelopeId));

  const signersWithSignature = new Set(
    envelopeFields
      .filter((f) => f.type === 'signature' && f.signerId)
      .map((f) => f.signerId!),
  );

  const signersWithoutSig = envelope.signers
    .filter((s) => s.role === 'signer' && !signersWithSignature.has(s.id));

  if (signersWithoutSig.length > 0) {
    const names = signersWithoutSig.map((s) => s.name).join(', ');
    res.status(400).json({
      success: false,
      error: `The following signers have no signature field: ${names}. Place at least one signature field for each signer before sending.`,
    });
    return;
  }

  await sendEnvelope(envelopeId);
  const updated = await getEnvelope(envelopeId);
  res.json({ success: true, data: updated });
});

/**
 * POST /api/envelopes/:id/void
 * Void/cancel an envelope.
 */
router.post('/:id/void', requireRole('admin', 'sender'), requireOwnership('id'), validate(voidEnvelopeSchema), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await voidEnvelope(id, req.body.reason);
  const envelope = await getEnvelope(id);

  res.json({ success: true, data: envelope });
});

/**
 * PUT /api/envelopes/:id/correct
 * Correct a sent envelope.
 */
router.put('/:id/correct', requireRole('admin', 'sender'), requireOwnership('id'), validate(correctEnvelopeSchema), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await correctEnvelope(id, req.body);
  const envelope = await getEnvelope(id);

  res.json({ success: true, data: envelope });
});

/**
 * POST /api/envelopes/:id/complete
 * Manually complete an envelope (for testing).
 */
router.post('/:id/complete', async (req, res) => {
  await completeEnvelope(req.params.id);
  const envelope = await getEnvelope(req.params.id);

  res.json({ success: true, data: envelope });
});

/**
 * PUT /api/envelopes/:id/transfer
 * Transfer envelope ownership to another user.
 */
router.put('/:id/transfer', requireRole('admin', 'sender'), requireOwnership('id'), async (req, res) => {
  const { id } = req.params;
  const { newOwnerId } = req.body;

  if (!newOwnerId) {
    return res.status(400).json({
      success: false,
      error: 'newOwnerId is required',
    });
  }

  const db = getDb();

  // Get current envelope
  const [envelope] = await db.select().from(envelopes).where(eq(envelopes.id, id)).limit(1);

  if (!envelope) {
    return res.status(404).json({
      success: false,
      error: 'Envelope not found',
    });
  }

  // Validate: only current owner can transfer
  // Note: In production, this should check req.user.id against envelope.createdBy
  // For now, we'll allow transfer if envelope exists

  // Validate: envelope must be in draft, sent, or in_progress status
  if (!['draft', 'sent', 'in_progress'].includes(envelope.status)) {
    return res.status(400).json({
      success: false,
      error: 'Cannot transfer envelope with status: ' + envelope.status,
    });
  }

  const oldOwner = envelope.createdBy;

  // Update ownership
  await db.update(envelopes).set({ createdBy: newOwnerId }).where(eq(envelopes.id, id));

  // Log audit event
  await logEvent({
    envelopeId: id,
    eventType: 'transferred',
    eventData: {
      from: oldOwner,
      to: newOwnerId,
    },
  });

  const updatedEnvelope = await getEnvelope(id);

  res.json({
    success: true,
    data: {
      envelopeId: id,
      newOwner: newOwnerId,
      envelope: updatedEnvelope,
    },
  });
});

// ─── Folder Management (Step 25.2) ──────────────────────────────────

/**
 * POST /api/folders
 * Create a new folder.
 */
router.post('/folders', async (req, res) => {
  const { name, parentId, sharedWith } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'Folder name is required',
    });
  }

  const db = getDb();

  // Note: In production, get createdBy from authenticated user
  const createdBy = req.body.createdBy || 'system';

  const [folder] = await db
    .insert(folders)
    .values({
      name,
      parentId: parentId || null,
      createdBy,
      sharedWith: sharedWith || [],
    })
    .returning();

  res.status(201).json({ success: true, data: folder });
});

/**
 * GET /api/folders
 * List folders for current user (owned + shared).
 */
router.get('/folders', async (req, res) => {
  const db = getDb();

  // Note: In production, filter by req.user.id
  const createdBy = req.query.createdBy as string || 'system';

  // Get folders owned by user or shared with user
  const userFolders = await db
    .select()
    .from(folders);
    // In production, add: .where(or(eq(folders.createdBy, userId), sql`${userId} = ANY(shared_with)`))

  res.json({ success: true, data: userFolders });
});

/**
 * GET /api/folders/:id
 * Get a specific folder.
 */
router.get('/folders/:id', async (req, res) => {
  const db = getDb();
  const [folder] = await db.select().from(folders).where(eq(folders.id, req.params.id));

  if (!folder) {
    return res.status(404).json({ success: false, error: 'Folder not found' });
  }

  res.json({ success: true, data: folder });
});

/**
 * PUT /api/folders/:id
 * Update folder name and sharing.
 */
router.put('/folders/:id', async (req, res) => {
  const { name, sharedWith } = req.body;
  const db = getDb();

  const [folder] = await db.select().from(folders).where(eq(folders.id, req.params.id));

  if (!folder) {
    return res.status(404).json({ success: false, error: 'Folder not found' });
  }

  await db
    .update(folders)
    .set({
      name: name || folder.name,
      sharedWith: sharedWith !== undefined ? sharedWith : folder.sharedWith,
    })
    .where(eq(folders.id, req.params.id));

  const [updatedFolder] = await db.select().from(folders).where(eq(folders.id, req.params.id));

  res.json({ success: true, data: updatedFolder });
});

/**
 * DELETE /api/folders/:id
 * Delete a folder (does not delete envelopes, just removes associations).
 */
router.delete('/folders/:id', async (req, res) => {
  const db = getDb();

  // Remove all envelope-folder associations
  await db.delete(envelopeFolders).where(eq(envelopeFolders.folderId, req.params.id));

  // Delete the folder
  await db.delete(folders).where(eq(folders.id, req.params.id));

  res.json({ success: true, data: { message: 'Folder deleted' } });
});

/**
 * POST /api/folders/:id/envelopes
 * Add envelope(s) to a folder.
 */
router.post('/folders/:id/envelopes', async (req, res) => {
  const { envelopeIds } = req.body;

  if (!envelopeIds || !Array.isArray(envelopeIds)) {
    return res.status(400).json({
      success: false,
      error: 'envelopeIds array is required',
    });
  }

  const db = getDb();
  const folderId = req.params.id;

  // Check if folder exists
  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));

  if (!folder) {
    return res.status(404).json({ success: false, error: 'Folder not found' });
  }

  // Add envelopes to folder (ignore duplicates)
  const values = envelopeIds.map((envelopeId) => ({
    envelopeId,
    folderId,
  }));

  await db.insert(envelopeFolders).values(values).onConflictDoNothing();

  res.json({
    success: true,
    data: { message: `Added ${envelopeIds.length} envelope(s) to folder` },
  });
});

/**
 * DELETE /api/folders/:id/envelopes/:envelopeId
 * Remove an envelope from a folder.
 */
router.delete('/folders/:id/envelopes/:envelopeId', async (req, res) => {
  const db = getDb();
  const { id: folderId, envelopeId } = req.params;

  await db
    .delete(envelopeFolders)
    .where(and(eq(envelopeFolders.folderId, folderId), eq(envelopeFolders.envelopeId, envelopeId)));

  res.json({ success: true, data: { message: 'Envelope removed from folder' } });
});

/**
 * GET /api/folders/:id/envelopes
 * List envelopes in a folder.
 */
router.get('/folders/:id/envelopes', async (req, res) => {
  const db = getDb();
  const folderId = req.params.id;

  // Get envelope IDs in this folder
  const envelopeFolderRecords = await db
    .select()
    .from(envelopeFolders)
    .where(eq(envelopeFolders.folderId, folderId));

  const envelopeIds = envelopeFolderRecords.map((ef) => ef.envelopeId);

  if (envelopeIds.length === 0) {
    return res.json({ success: true, data: [] });
  }

  // Get envelope details
  const folderEnvelopes = await db
    .select()
    .from(envelopes)
    .where(inArray(envelopes.id, envelopeIds));

  res.json({ success: true, data: folderEnvelopes });
});

// ─── Embedded Signing (Step 31 — Salesforce Support) ────────────

/**
 * POST /api/envelopes/:id/embedded-signing
 * Generate a short-lived embedded signing URL for iframe-based signing.
 * Used by the Salesforce managed package and SDK.
 */
router.post('/:id/embedded-signing', async (req, res) => {
  const { id } = req.params;
  const { signerEmail, returnUrl } = req.body;

  if (!signerEmail) {
    return res.status(400).json({ success: false, error: 'signerEmail is required' });
  }

  const db = getDb();

  // Find the signer by email within this envelope
  const [signer] = await db
    .select()
    .from(signersTable)
    .where(
      and(
        eq(signersTable.envelopeId, id),
        eq(signersTable.email, signerEmail),
      ),
    )
    .limit(1);

  if (!signer) {
    return res.status(404).json({ success: false, error: 'Signer not found for this envelope' });
  }

  if (!signer.signingToken) {
    return res.status(400).json({ success: false, error: 'No signing token available for this signer' });
  }

  // Build embedded signing URL
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const embedUrl = `${baseUrl}/sign/${signer.signingToken}?embed=true${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;

  res.json({
    success: true,
    data: {
      url: embedUrl,
      expiresAt: signer.tokenExpiresAt?.toISOString() || null,
    },
  });
});

// ─── Document Generation / Mail Merge (Step 29) ─────────────────

/**
 * POST /api/envelopes/generate
 * Create envelope with merged data from template.
 */
router.post('/generate', requireRole('admin', 'sender'), async (req, res) => {
  const { templateId, mergeData, signers } = req.body;

  if (!templateId || !signers || !Array.isArray(signers)) {
    return res.status(400).json({
      success: false,
      error: 'templateId and signers array are required',
    });
  }

  const db = getDb();

  // Get template
  const [template] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);

  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }

  try {
    // Retrieve template document
    const { retrieveDocument } = await import('../../storage/documentStore.js');
    const templateDoc = await retrieveDocument(template.documentKey);

    // Merge data if provided
    let finalDoc = templateDoc;
    if (mergeData && Object.keys(mergeData).length > 0) {
      const { mergeFields } = await import('../../documents/mailMerge.js');
      finalDoc = await mergeFields(templateDoc, mergeData);
    }

    // Upload merged document
    const docKey = `generated/${uuidv4()}_${template.name}.pdf`;
    await uploadDocument(docKey, finalDoc);

    // Create envelope (similar to template instantiation)
    const organizationId = getOrganizationId(req);
    const [envelope] = await db
      .insert(envelopesTable)
      .values({
        organizationId,
        subject: template.name,
        message: `Generated from template: ${template.name}`,
        status: 'draft',
        signingOrder: 'sequential',
        createdBy: req.user?.id || 'system',
      })
      .returning();

    // Create document record
    const [doc] = await db
      .insert(documents)
      .values({
        envelopeId: envelope.id,
        filename: `${template.name}.pdf`,
        contentType: 'application/pdf',
        storagePath: docKey,
        documentHash: 'placeholder',
        order: 0,
      })
      .returning();

    // Create signers
    for (const signerData of signers) {
      const [signer] = await db
        .insert(signersTable)
        .values({
          envelopeId: envelope.id,
          name: signerData.name,
          email: signerData.email,
          role: signerData.role || 'signer',
          order: signerData.order || 1,
          status: 'pending',
        })
        .returning();

      // Copy fields from template
      const templateFields = template.fieldConfig as any[];
      if (Array.isArray(templateFields)) {
        for (const fieldConfig of templateFields) {
          await db.insert(fieldsTable).values({
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
    }

    res.status(201).json({ success: true, data: { envelopeId: envelope.id } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to generate envelope: ${(error as Error).message}`,
    });
  }
});

/**
 * POST /api/envelopes/bulk
 * Bulk send with per-recipient merge data.
 */
router.post('/bulk', requireRole('admin', 'sender'), async (req, res) => {
  const { templateId, recipients } = req.body;

  if (!templateId || !recipients || !Array.isArray(recipients)) {
    return res.status(400).json({
      success: false,
      error: 'templateId and recipients array are required',
    });
  }

  try {
    const { processBulkSend } = await import('../../workflow/bulkSender.js');
    const organizationId = getOrganizationId(req);

    const result = await processBulkSend(templateId, recipients, {
      templateId,
      organizationId,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Bulk send failed: ${(error as Error).message}`,
    });
  }
});

/**
 * POST /api/envelopes/bulk/csv
 * Bulk send from CSV upload.
 */
router.post('/bulk/csv', upload.single('csv'), requireRole('admin', 'sender'), async (req, res) => {
  const { templateId } = req.body;
  const csvFile = req.file;

  if (!templateId || !csvFile) {
    return res.status(400).json({
      success: false,
      error: 'templateId and CSV file are required',
    });
  }

  try {
    const csvContent = csvFile.buffer.toString('utf8');
    const { parseCsvForMerge } = await import('../../documents/mailMerge.js');

    const recipients = parseCsvForMerge(csvContent);

    const { processBulkSend } = await import('../../workflow/bulkSender.js');
    const organizationId = getOrganizationId(req);

    const result = await processBulkSend(templateId, recipients, {
      templateId,
      organizationId,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `CSV bulk send failed: ${(error as Error).message}`,
    });
  }
});

/**
 * GET /api/envelopes/bulk/:batchId/status
 * Get bulk send batch status.
 */
router.get('/bulk/:batchId/status', async (req, res) => {
  const { batchId } = req.params;

  try {
    const { getBulkSendStatus } = await import('../../workflow/bulkSender.js');
    const status = await getBulkSendStatus(batchId);

    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get bulk status: ${(error as Error).message}`,
    });
  }
});

export default router;
