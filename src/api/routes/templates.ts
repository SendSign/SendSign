import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { getDb } from '../../db/connection.js';
import { templates } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  documentKey: z.string().min(1),
  fieldConfig: z.array(z.any()),
  signerRoles: z.array(z.any()),
});

/**
 * POST /api/templates
 * Create a new template.
 */
router.post('/', requireRole('admin', 'sender'), validate(createTemplateSchema), async (req, res) => {
  const db = getDb();

  const [template] = await db
    .insert(templates)
    .values({
      id: uuidv4(),
      name: req.body.name,
      description: req.body.description,
      documentKey: req.body.documentKey,
      fieldConfig: req.body.fieldConfig,
      signerRoles: req.body.signerRoles,
    })
    .returning();

  res.status(201).json({ success: true, data: template });
});

/**
 * GET /api/templates
 * List all templates.
 */
router.get('/', async (req, res) => {
  const db = getDb();
  const allTemplates = await db.select().from(templates);

  res.json({ success: true, data: allTemplates });
});

/**
 * GET /api/templates/:id
 * Get a specific template.
 */
router.get('/:id', async (req, res) => {
  const db = getDb();
  const [template] = await db.select().from(templates).where(eq(templates.id, req.params.id));

  if (!template) {
    res.status(404).json({ success: false, error: 'Template not found' });
    return;
  }

  res.json({ success: true, data: template });
});

/**
 * PUT /api/templates/:id
 * Update a template (reject if locked).
 */
router.put('/:id', requireRole('admin', 'sender'), async (req, res) => {
  const db = getDb();
  const [template] = await db.select().from(templates).where(eq(templates.id, req.params.id));

  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }

  if (template.isLocked) {
    return res.status(403).json({
      success: false,
      error: `Template is locked by ${template.lockedBy}. Unlock it first or create a copy.`,
    });
  }

  await db
    .update(templates)
    .set({
      name: req.body.name ?? template.name,
      description: req.body.description ?? template.description,
      fieldConfig: req.body.fieldConfig ?? template.fieldConfig,
      signerRoles: req.body.signerRoles ?? template.signerRoles,
      updatedAt: new Date(),
    })
    .where(eq(templates.id, req.params.id));

  const [updatedTemplate] = await db.select().from(templates).where(eq(templates.id, req.params.id));

  res.json({ success: true, data: updatedTemplate });
});

/**
 * DELETE /api/templates/:id
 * Delete a template (reject if locked).
 */
router.delete('/:id', requireRole('admin', 'sender'), async (req, res) => {
  const db = getDb();
  const [template] = await db.select().from(templates).where(eq(templates.id, req.params.id));

  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }

  if (template.isLocked) {
    return res.status(403).json({
      success: false,
      error: `Template is locked by ${template.lockedBy}. Cannot delete locked templates.`,
    });
  }

  await db.delete(templates).where(eq(templates.id, req.params.id));

  res.json({ success: true, data: { message: 'Template deleted' } });
});

/**
 * PUT /api/templates/:id/lock
 * Lock a template (only creator or admin).
 */
router.put('/:id/lock', requireRole('admin'), async (req, res) => {
  const db = getDb();
  const [template] = await db.select().from(templates).where(eq(templates.id, req.params.id));

  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }

  if (template.isLocked) {
    return res.status(400).json({
      success: false,
      error: `Template is already locked by ${template.lockedBy}`,
    });
  }

  // Note: In production, check if user is creator or has admin role
  const lockedBy = req.body.lockedBy || template.createdBy;

  await db
    .update(templates)
    .set({
      isLocked: true,
      lockedBy,
      lockedAt: new Date(),
    })
    .where(eq(templates.id, req.params.id));

  const [updatedTemplate] = await db.select().from(templates).where(eq(templates.id, req.params.id));

  res.json({ success: true, data: updatedTemplate });
});

/**
 * PUT /api/templates/:id/unlock
 * Unlock a template (only the user who locked it or admin).
 */
router.put('/:id/unlock', requireRole('admin'), async (req, res) => {
  const db = getDb();
  const [template] = await db.select().from(templates).where(eq(templates.id, req.params.id));

  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }

  if (!template.isLocked) {
    return res.status(400).json({
      success: false,
      error: 'Template is not locked',
    });
  }

  // Note: In production, check if user is the one who locked it or has admin role

  await db
    .update(templates)
    .set({
      isLocked: false,
      lockedBy: null,
      lockedAt: null,
    })
    .where(eq(templates.id, req.params.id));

  const [updatedTemplate] = await db.select().from(templates).where(eq(templates.id, req.params.id));

  res.json({ success: true, data: updatedTemplate });
});

/**
 * POST /api/templates/:id/duplicate
 * Create an unlocked copy of any template.
 */
router.post('/:id/duplicate', requireRole('admin', 'sender'), async (req, res) => {
  const db = getDb();
  const [originalTemplate] = await db
    .select()
    .from(templates)
    .where(eq(templates.id, req.params.id));

  if (!originalTemplate) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }

  // Create unlocked copy
  const [duplicateTemplate] = await db
    .insert(templates)
    .values({
      organizationId: originalTemplate.organizationId,
      name: `${originalTemplate.name} (Copy)`,
      description: originalTemplate.description,
      documentKey: originalTemplate.documentKey,
      fieldConfig: originalTemplate.fieldConfig,
      signerRoles: originalTemplate.signerRoles,
      createdBy: req.body.createdBy || originalTemplate.createdBy,
      isLocked: false,
      lockedBy: null,
      lockedAt: null,
    })
    .returning();

  res.status(201).json({ success: true, data: duplicateTemplate });
});

export default router;
