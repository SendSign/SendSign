import { Router } from 'express';
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
import { uploadDocument } from '../../storage/documentStore.js';
import { hashDocument } from '../../crypto/hasher.js';
import { getDb } from '../../db/connection.js';
import { documents } from '../../db/schema.js';
import { v4 as uuidv4 } from 'uuid';
import { enforceEnvelopeLimit, enforceVerificationLevel } from '../middleware/planEnforcement.js';
import { getOrganizationId } from '../middleware/auth.js';
import { requireRole, requireOwnership } from '../middleware/rbac.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Schemas ─────────────────────────────────────────────────────────

const createEnvelopeSchema = z.object({
  subject: z.string().min(1),
  message: z.string().optional(),
  signingOrder: z.enum(['sequential', 'parallel']).default('sequential'),
  expiresAt: z.string().datetime().optional(),
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
router.post('/', upload.array('documents', 10), requireRole('admin', 'sender'), enforceEnvelopeLimit, enforceVerificationLevel, validate(createEnvelopeSchema), async (req, res) => {
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
  });

  // Upload documents if provided
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const docId = uuidv4();

      // Upload to storage
      const storagePath = await uploadDocument(file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
        envelopeId: envelope.id,
      });

      // Save document record
      await db.insert(documents).values({
        id: docId,
        envelopeId: envelope.id,
        filename: file.originalname,
        contentType: file.mimetype,
        storagePath,
        documentHash: hashDocument(file.buffer),
        order: i,
      });
    }
  }

  res.status(201).json({ success: true, data: envelope });
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

/**
 * POST /api/envelopes/:id/send
 * Send an envelope to signers.
 */
router.post('/:id/send', requireRole('admin', 'sender'), requireOwnership('id'), async (req, res) => {
  await sendEnvelope(req.params.id);
  const envelope = await getEnvelope(req.params.id);

  res.json({ success: true, data: envelope });
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

export default router;
