/**
 * Retention policy API endpoints.
 */

import express from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  getPolicy,
  createPresetPolicies,
  POLICY_PRESETS,
} from '../../storage/retentionPolicies.js';
import {
  assignPolicy,
  getExpiringDocuments,
  generateRetentionReport,
  processRetention,
} from '../../storage/retentionManager.js';
import { logEvent } from '../../audit/auditLogger.js';

const router = express.Router();

// ─── Validation Schemas ─────────────────────────────────────────────

const createPolicySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  retentionDays: z.number().int().positive(),
  documentTypes: z.array(z.string()).optional(),
  autoDelete: z.boolean().optional(),
  notifyBefore: z.number().int().positive().optional(),
});

const assignPolicySchema = z.object({
  policyId: z.string().uuid(),
});

// ─── Routes ─────────────────────────────────────────────────────────

/**
 * GET /api/retention/policies
 * List all retention policies including presets.
 */
router.get('/policies', async (req, res) => {
  const organizationId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;

  const policies = await listPolicies(organizationId);

  // Include presets info
  res.json({
    success: true,
    data: {
      policies,
      presets: Object.keys(POLICY_PRESETS).map((key) => ({
        id: key,
        ...POLICY_PRESETS[key],
      })),
    },
  });
});

/**
 * POST /api/retention/policies
 * Create a custom retention policy.
 */
router.post('/policies', validate(createPolicySchema), async (req, res) => {
  const { name, description, retentionDays, documentTypes, autoDelete, notifyBefore } = req.body;

  const policy = await createPolicy({
    organizationId: null, // TODO: Get from auth context
    name,
    description,
    retentionDays,
    documentTypes,
    autoDelete: autoDelete ?? false,
    notifyBefore: notifyBefore ?? 30,
  });

  await logEvent({
    envelopeId: null,
    signerId: null,
    eventType: 'retention_policy_created',
    eventData: { policyId: policy.id, name: policy.name },
    actorId: 'admin',
    ipAddress: req.ip ?? '',
  });

  res.json({
    success: true,
    data: policy,
  });
});

/**
 * POST /api/retention/policies/create-presets
 * Create all preset policies for an organization.
 */
router.post('/policies/create-presets', async (req, res) => {
  const organizationId = typeof req.body.organizationId === 'string' ? req.body.organizationId : undefined;

  const policies = await createPresetPolicies(organizationId);

  res.json({
    success: true,
    data: { created: policies.length, policies },
  });
});

/**
 * PUT /api/retention/policies/:id
 * Update a retention policy.
 */
router.put('/policies/:id', validate(createPolicySchema.partial()), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const policy = await updatePolicy(id, req.body);

  await logEvent({
    envelopeId: null,
    signerId: null,
    eventType: 'retention_policy_updated',
    eventData: { policyId: id },
    actorId: 'admin',
    ipAddress: req.ip ?? '',
  });

  res.json({
    success: true,
    data: policy,
  });
});

/**
 * DELETE /api/retention/policies/:id
 * Delete a retention policy.
 */
router.delete('/policies/:id', async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  await deletePolicy(id);

  await logEvent({
    envelopeId: null,
    signerId: null,
    eventType: 'retention_policy_deleted',
    eventData: { policyId: id },
    actorId: 'admin',
    ipAddress: req.ip ?? '',
  });

  res.json({ success: true, data: { deleted: true } });
});

/**
 * POST /api/envelopes/:id/retention
 * Assign a retention policy to an envelope.
 */
router.post('/:envelopeId/retention', validate(assignPolicySchema), async (req, res) => {
  const envelopeId = Array.isArray(req.params.envelopeId) ? req.params.envelopeId[0] : req.params.envelopeId;
  const { policyId } = req.body;

  // Verify policy exists
  const policy = await getPolicy(policyId);

  if (!policy) {
    res.status(404).json({
      success: false,
      error: 'Retention policy not found',
    });
    return;
  }

  await assignPolicy(envelopeId, policyId);

  res.json({
    success: true,
    data: {
      envelopeId,
      policyId,
      policyName: policy.name,
      retentionDays: policy.retentionDays,
    },
  });
});

/**
 * GET /api/retention/expiring
 * List documents expiring within N days.
 */
router.get('/expiring', async (req, res) => {
  const days = typeof req.query.days === 'string' ? parseInt(req.query.days, 10) : 30;

  const expiring = await getExpiringDocuments(days);

  res.json({
    success: true,
    data: { count: expiring.length, documents: expiring },
  });
});

/**
 * GET /api/retention/report
 * Generate and download a retention report PDF.
 */
router.get('/report', async (req, res) => {
  const reportPdf = await generateRetentionReport();

  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="retention-report-${new Date().toISOString().split('T')[0]}.pdf"`);
  res.send(reportPdf);
});

/**
 * POST /api/retention/process
 * Manually trigger retention processing (normally runs as cron job).
 */
router.post('/process', async (req, res) => {
  const report = await processRetention();

  await logEvent({
    envelopeId: null,
    signerId: null,
    eventType: 'retention_processed',
    eventData: report,
    actorId: 'admin',
    ipAddress: req.ip ?? '',
  });

  res.json({
    success: true,
    data: report,
  });
});

export default router;
