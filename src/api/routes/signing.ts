import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { validateToken } from '../../ceremony/tokenGenerator.js';
import { getEnvelope } from '../../workflow/envelopeManager.js';
import { canSignerSign } from '../../workflow/signingOrder.js';
import { getDb } from '../../db/connection.js';
import { envelopes, signers, fields, documents, comments } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logEvent } from '../../audit/auditLogger.js';
import { downloadDocument } from '../../storage/documentStore.js';

const router = Router();

/**
 * Helper: Set RLS context for signing ceremony routes.
 * Uses the tenantId from the validated signing token.
 */
async function setSigningTenantContext(tenantId: string): Promise<void> {
  const db = getDb();
  await db.execute(sql.raw(`SET LOCAL app.tenant_id = '${tenantId}'`));
}

const signFieldSchema = z.object({
  fields: z.array(
    z.object({
      fieldId: z.string().uuid(),
      value: z.string(),
    }),
  ),
});

/**
 * GET /api/sign/:token
 * Get signing ceremony details by token.
 */
router.get('/:token', async (req, res) => {
  const tokenResult = await validateToken(req.params.token);

  if (!tokenResult.valid) {
    res.status(401).json({ success: false, error: tokenResult.reason });
    return;
  }

  // Set RLS context for tenant isolation
  await setSigningTenantContext(tokenResult.signer!.tenantId);

  const envelope = await getEnvelope(tokenResult.signer!.envelopeId);
  if (!envelope) {
    res.status(404).json({ success: false, error: 'Envelope not found' });
    return;
  }

  // Check if signer can sign
  const signerInfo = envelope.signers.find((s) => s.id === tokenResult.signer!.id);
  if (!signerInfo) {
    res.status(404).json({ success: false, error: 'Signer not found' });
    return;
  }

  const canSign = canSignerSign(
    {
      id: signerInfo.id,
      name: signerInfo.name,
      email: signerInfo.email,
      order: signerInfo.order,
      signingGroup: signerInfo.signingGroup,
      status: signerInfo.status,
    },
    {
      id: envelope.id,
      signingOrder: envelope.signingOrder,
      status: envelope.status,
      signers: envelope.signers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        order: s.order,
        signingGroup: s.signingGroup,
        status: s.status,
      })),
    },
  );

  if (!canSign) {
    res.status(403).json({ success: false, error: 'Not your turn to sign yet' });
    return;
  }

  // Get fields for this signer
  const signerFields = envelope.fields.filter((f) => f.signerId === signerInfo.id);

  res.json({
    success: true,
    data: {
      envelope: {
        id: envelope.id,
        subject: envelope.subject,
        message: envelope.message,
      },
      signer: signerInfo,
      fields: signerFields,
    },
  });
});

/**
 * GET /api/sign/:token/document
 * Serve the decrypted PDF for the signing ceremony.
 * Authenticated by the signing token — no API key required.
 */
router.get('/:token/document', async (req, res) => {
  const tokenResult = await validateToken(req.params.token);

  if (!tokenResult.valid) {
    res.status(401).json({ success: false, error: tokenResult.reason });
    return;
  }

  await setSigningTenantContext(tokenResult.signer!.tenantId);

  try {
    const db = getDb();
    const envelopeId = tokenResult.signer!.envelopeId;

    // Strategy 1: look in the documents table (multi-document envelopes)
    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.envelopeId, envelopeId))
      .orderBy(documents.order);

    if (docs.length > 0) {
      const doc = docs[0];

      // If the stored document is not a PDF (e.g., conversion failed at upload),
      // return a descriptive error instead of serving a broken file
      if (doc.contentType !== 'application/pdf' && !doc.filename.toLowerCase().endsWith('.pdf')) {
        res.status(422).json({
          success: false,
          error: 'PDF conversion required',
          detail:
            `The uploaded document "${doc.filename}" is not a PDF (type: ${doc.contentType}). ` +
            'Automatic conversion was unavailable at upload time. ' +
            'Please re-upload the document as a PDF, or install LibreOffice on the server to enable automatic conversion.',
        });
        return;
      }

      const pdfBuffer = await downloadDocument(doc.storagePath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
      return;
    }

    // Strategy 2: fall back to envelope.documentKey (seed data, MCP-created envelopes)
    const [envelope] = await db
      .select()
      .from(envelopes)
      .where(eq(envelopes.id, envelopeId))
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
 * POST /api/sign/:token
 * Submit signed fields.
 */
router.post('/:token', validate(signFieldSchema), async (req, res) => {
  const token = typeof req.params.token === 'string' ? req.params.token : req.params.token[0];
  const tokenResult = await validateToken(token);

  if (!tokenResult.valid) {
    res.status(401).json({ success: false, error: tokenResult.reason });
    return;
  }

  await setSigningTenantContext(tokenResult.signer!.tenantId);

  const db = getDb();
  const signerId = tokenResult.signer!.id;
  const envelopeId = tokenResult.signer!.envelopeId;

  // Update field values
  for (const field of req.body.fields) {
    await db
      .update(fields)
      .set({ value: field.value, filledAt: new Date() })
      .where(eq(fields.id, field.fieldId));
  }

  // Capture IP and user agent at signing time if not already captured
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null;
  const userAgent = req.headers['user-agent'] || null;

  // Update signer status
  await db
    .update(signers)
    .set({
      status: 'completed',
      signedAt: new Date(),
      // Only update IP/UA if not already set (from consent)
      ipAddress: ipAddress ? (typeof ipAddress === 'string' ? ipAddress : Array.isArray(ipAddress) ? ipAddress[0] : null) : undefined,
      userAgent: userAgent || undefined,
    })
    .where(eq(signers.id, signerId));

  // Log audit event
  await logEvent({
    envelopeId,
    signerId,
    eventType: 'signed',
    eventData: { fieldCount: req.body.fields.length },
  });

  // Dispatch webhook for signer completed
  try {
    const { dispatch: dispatchWebhook } = await import('../../notifications/webhookDispatcher.js');
    await dispatchWebhook('signer.completed', { envelopeId, signerId, signerName: tokenResult.signer!.name, signerEmail: tokenResult.signer!.email });
  } catch { /* non-critical */ }

  // Check if all signers have completed — if so, seal the envelope
  const allSigners = await db.select().from(signers).where(eq(signers.envelopeId, envelopeId));
  const allComplete = allSigners.every((s) => s.status === 'completed' || s.role !== 'signer');

  if (allComplete) {
    const { completeEnvelope } = await import('../../workflow/envelopeManager.js');
    // Complete asynchronously — don't block the signer's response
    completeEnvelope(envelopeId).catch((err) => {
      console.error('Failed to complete envelope:', err);
    });
  }

  // Dispatch to integrations
  const { integrationRegistry } = await import('../../integrations/registry.js');
  const { getEnvelope } = await import('../../workflow/envelopeManager.js');
  const fullEnvelope = await getEnvelope(envelopeId);
  if (fullEnvelope) {
    const signerInfo = {
      id: tokenResult.signer!.id,
      name: tokenResult.signer!.name,
      email: tokenResult.signer!.email,
    };
    await integrationRegistry.dispatchEvent('signerCompleted', {
      envelope: fullEnvelope as any,
      signer: signerInfo,
    });
  }

  res.json({ success: true, data: { message: 'Document signed successfully' } });
});

/**
 * POST /api/sign/:token/decline
 * Decline to sign a document.
 */
router.post('/:token/decline', async (req, res) => {
  const token = typeof req.params.token === 'string' ? req.params.token : req.params.token[0];
  const tokenResult = await validateToken(token);

  if (!tokenResult.valid) {
    res.status(401).json({ success: false, error: tokenResult.reason });
    return;
  }

  await setSigningTenantContext(tokenResult.signer!.tenantId);

  const db = getDb();
  const signerId = tokenResult.signer!.id;
  const envelopeId = tokenResult.signer!.envelopeId;
  const reason = req.body?.reason || 'No reason provided';

  // Update signer status to declined
  await db
    .update(signers)
    .set({
      status: 'declined',
      declinedReason: reason,
      signingToken: null,
      tokenExpiresAt: null,
    })
    .where(eq(signers.id, signerId));

  // Log audit event
  await logEvent({
    envelopeId,
    signerId,
    eventType: 'declined',
    eventData: { reason },
    ipAddress: (req.ip || req.headers['x-forwarded-for'] || '') as string,
    userAgent: req.headers['user-agent'] || '',
  });

  // Dispatch webhook for signer declined
  try {
    const { dispatch: dispatchWebhook } = await import('../../notifications/webhookDispatcher.js');
    await dispatchWebhook('signer.declined', { envelopeId, signerId, signerName: tokenResult.signer!.name, reason });
  } catch { /* non-critical */ }

  // Void the entire envelope when a signer declines
  try {
    const { voidEnvelope } = await import('../../workflow/envelopeManager.js');
    await voidEnvelope(envelopeId, `Declined by ${tokenResult.signer!.name}: ${reason}`);
  } catch {
    // Non-critical — status may already be void
  }

  res.json({
    success: true,
    data: {
      declined: true,
      message: 'You have declined to sign this document. The sender has been notified.',
    },
  });
});

/**
 * POST /api/sign/:token/consent
 * Record e-signature consent
 */
router.post('/:token/consent', async (req, res) => {
  const token = typeof req.params.token === 'string' ? req.params.token : req.params.token[0];
  const tokenResult = await validateToken(token);

  if (!tokenResult.valid) {
    res.status(401).json({ success: false, error: tokenResult.reason });
    return;
  }

  await setSigningTenantContext(tokenResult.signer!.tenantId);

  const db = getDb();
  const signerId = tokenResult.signer!.id;
  const { consentedAt, userAgent } = req.body;

  // Get IP address from request
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null;

  // Update signer with consent information
  await db
    .update(signers)
    .set({
      consentedAt: consentedAt ? new Date(consentedAt) : new Date(),
      consentUserAgent: userAgent || null,
      ipAddress: typeof ipAddress === 'string' ? ipAddress : Array.isArray(ipAddress) ? ipAddress[0] : null,
    })
    .where(eq(signers.id, signerId));

  // Log audit event
  await logEvent({
    envelopeId: tokenResult.signer!.envelopeId,
    signerId,
    eventType: 'consent_given',
    eventData: { ipAddress, userAgent },
  });

  res.json({ success: true, data: { message: 'Consent recorded' } });
});

/**
 * Delegate signing responsibility to another person
 * POST /sign/:token/delegate
 */
router.post('/:token/delegate', async (req, res) => {
  const { token } = req.params;
  const { delegateEmail, delegateName } = req.body;

  if (!delegateEmail || !delegateName) {
    return res.status(400).json({
      success: false,
      error: 'delegateEmail and delegateName are required',
    });
  }

  // Validate token
  const { validateSigningToken } = await import('../../ceremony/tokenManager.js');
  const tokenResult = await validateSigningToken(token);

  if (!tokenResult.valid || !tokenResult.signer) {
    return res.status(400).json({
      success: false,
      error: tokenResult.error ?? 'Invalid or expired token',
    });
  }

  const db = getDb();
  const originalSigner = tokenResult.signer;

  // Validate: signer status must be pending or notified (cannot delegate after opening)
  if (originalSigner.status !== 'pending' && originalSigner.status !== 'notified') {
    return res.status(400).json({
      success: false,
      error: 'Cannot delegate after signing has started. Status must be pending or notified.',
    });
  }

  // Generate new token for delegate
  const { generateSigningToken } = await import('../../ceremony/tokenManager.js');
  const newToken = generateSigningToken();
  const tokenExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

  // Create new signer record
  const [newSigner] = await db
    .insert(signers)
    .values({
      tenantId: tokenResult.signer!.tenantId,
      envelopeId: originalSigner.envelopeId,
      name: delegateName,
      email: delegateEmail,
      role: originalSigner.role,
      order: originalSigner.order,
      signingGroup: originalSigner.signingGroup,
      notificationChannel: originalSigner.notificationChannel,
      status: 'notified',
      signingToken: newToken,
      tokenExpiresAt: tokenExpiry,
      delegatedFrom: originalSigner.id,
    })
    .returning();

  // Reassign all fields from original signer to delegate
  await db
    .update(fields)
    .set({ signerId: newSigner.id })
    .where(eq(fields.signerId, originalSigner.id));

  // Void original signer's token (set status to 'delegated')
  await db
    .update(signers)
    .set({ status: 'delegated', signingToken: null })
    .where(eq(signers.id, originalSigner.id));

  // Log audit event
  await logEvent({
    envelopeId: originalSigner.envelopeId,
    signerId: originalSigner.id,
    eventType: 'delegated',
    eventData: {
      from: originalSigner.email,
      to: delegateEmail,
      delegateId: newSigner.id,
    },
  });

  // Send signing notification to the delegate
  const { sendSigningNotification } = await import('../../notifications/index.js');
  const { getEnvelope } = await import('../../workflow/envelopeManager.js');
  const envelope = await getEnvelope(originalSigner.envelopeId);

  if (envelope) {
    await sendSigningNotification({
      signer: newSigner as any,
      envelope: envelope as any,
      signingUrl: `${process.env.BASE_URL}/sign/${newToken}`,
    });
  }

  res.json({
    success: true,
    data: {
      delegateId: newSigner.id,
      delegateEmail: newSigner.email,
      message: `Signing responsibility delegated to ${delegateName}`,
    },
  });
});

// ─── Collaborative Commenting (Step 28) ──────────────────────────

/**
 * POST /sign/:token/comments
 * Create a comment on a document, field, or page.
 */
router.post('/:token/comments', async (req, res) => {
  const { token } = req.params;
  const { content, fieldId, documentId, page, x, y, parentId } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Comment content is required',
    });
  }

  // Validate token
  const { validateSigningToken } = await import('../../ceremony/tokenManager.js');
  const tokenResult = await validateSigningToken(token);

  if (!tokenResult.valid || !tokenResult.signer) {
    return res.status(400).json({
      success: false,
      error: tokenResult.error ?? 'Invalid or expired token',
    });
  }

  const db = getDb();
  const signer = tokenResult.signer;

  // Create comment
  const [comment] = await db
    .insert(comments)
    .values({
      tenantId: tokenResult.signer!.tenantId,
      envelopeId: signer.envelopeId,
      signerId: signer.id,
      documentId: documentId || null,
      fieldId: fieldId || null,
      page: page || null,
      x: x || null,
      y: y || null,
      content: content.trim(),
      parentId: parentId || null,
    })
    .returning();

  // Log audit event
  await logEvent({
    envelopeId: signer.envelopeId,
    signerId: signer.id,
    eventType: 'commented',
    eventData: {
      commentId: comment.id,
      fieldId: fieldId || null,
      content: content.substring(0, 200),
    },
  });

  // Notify other signers who have been notified
  try {
    const otherSigners = await db
      .select()
      .from(signers)
      .where(
        and(
          eq(signers.envelopeId, signer.envelopeId),
        ),
      );

    const notifiedSigners = otherSigners.filter(
      (s) => s.id !== signer.id && ['notified', 'completed', 'signed'].includes(s.status),
    );

    if (notifiedSigners.length > 0) {
      const { sendCommentNotification } = await import('../../notifications/index.js');
      const envelope = await getEnvelope(signer.envelopeId);

      if (envelope && typeof sendCommentNotification === 'function') {
        for (const otherSigner of notifiedSigners) {
          await sendCommentNotification({
            signer: otherSigner as any,
            commenter: { name: signer.name, email: signer.email },
            envelope: envelope as any,
            commentPreview: content.substring(0, 200),
          }).catch(() => {}); // Non-critical
        }
      }
    }
  } catch {
    // Comment notification is non-critical — don't fail the request
  }

  res.status(201).json({ success: true, data: comment });
});

/**
 * GET /sign/:token/comments
 * List all comments on the envelope visible to this signer.
 */
router.get('/:token/comments', async (req, res) => {
  const { token } = req.params;

  const { validateSigningToken } = await import('../../ceremony/tokenManager.js');
  const tokenResult = await validateSigningToken(token);

  if (!tokenResult.valid || !tokenResult.signer) {
    return res.status(400).json({
      success: false,
      error: tokenResult.error ?? 'Invalid or expired token',
    });
  }

  const db = getDb();
  const signer = tokenResult.signer;

  // Get all comments for this envelope
  const allComments = await db
    .select()
    .from(comments)
    .where(eq(comments.envelopeId, signer.envelopeId));

  // Enrich with signer names
  const envelopeSigners = await db
    .select({ id: signers.id, name: signers.name, email: signers.email })
    .from(signers)
    .where(eq(signers.envelopeId, signer.envelopeId));

  const signerMap = new Map(envelopeSigners.map((s) => [s.id, s]));

  const enrichedComments = allComments.map((c) => ({
    ...c,
    author: signerMap.get(c.signerId) ?? { name: 'Unknown', email: '' },
  }));

  // Build threaded structure
  const topLevel = enrichedComments.filter((c) => !c.parentId);
  const replies = enrichedComments.filter((c) => c.parentId);

  const threaded = topLevel.map((comment) => ({
    ...comment,
    replies: replies.filter((r) => r.parentId === comment.id),
  }));

  res.json({ success: true, data: threaded });
});

/**
 * PUT /sign/:token/comments/:commentId/resolve
 * Mark a comment as resolved.
 */
router.put('/:token/comments/:commentId/resolve', async (req, res) => {
  const { token, commentId } = req.params;

  const { validateSigningToken } = await import('../../ceremony/tokenManager.js');
  const tokenResult = await validateSigningToken(token);

  if (!tokenResult.valid || !tokenResult.signer) {
    return res.status(400).json({
      success: false,
      error: tokenResult.error ?? 'Invalid or expired token',
    });
  }

  const db = getDb();
  const signer = tokenResult.signer;

  // Verify comment exists and belongs to this envelope
  const [comment] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.envelopeId, signer.envelopeId)))
    .limit(1);

  if (!comment) {
    return res.status(404).json({ success: false, error: 'Comment not found' });
  }

  // Only the comment author or the envelope sender can resolve
  await db
    .update(comments)
    .set({
      resolved: true,
      resolvedBy: signer.id,
    })
    .where(eq(comments.id, commentId));

  const [updated] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);

  res.json({ success: true, data: updated });
});

/**
 * POST /sign/:token/comments/:commentId/reply
 * Reply to a comment (creates child with parent_id).
 */
router.post('/:token/comments/:commentId/reply', async (req, res) => {
  const { token, commentId } = req.params;
  const { content } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Reply content is required',
    });
  }

  const { validateSigningToken } = await import('../../ceremony/tokenManager.js');
  const tokenResult = await validateSigningToken(token);

  if (!tokenResult.valid || !tokenResult.signer) {
    return res.status(400).json({
      success: false,
      error: tokenResult.error ?? 'Invalid or expired token',
    });
  }

  const db = getDb();
  const signer = tokenResult.signer;

  // Verify parent comment exists
  const [parentComment] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.envelopeId, signer.envelopeId)))
    .limit(1);

  if (!parentComment) {
    return res.status(404).json({ success: false, error: 'Parent comment not found' });
  }

  // Create reply
  const [reply] = await db
    .insert(comments)
    .values({
      tenantId: tokenResult.signer!.tenantId,
      envelopeId: signer.envelopeId,
      signerId: signer.id,
      documentId: parentComment.documentId,
      fieldId: parentComment.fieldId,
      page: parentComment.page,
      content: content.trim(),
      parentId: commentId,
    })
    .returning();

  // Log audit event
  await logEvent({
    envelopeId: signer.envelopeId,
    signerId: signer.id,
    eventType: 'commented',
    eventData: {
      commentId: reply.id,
      parentId: commentId,
      content: content.substring(0, 200),
    },
  });

  res.status(201).json({ success: true, data: reply });
});

/**
 * GET /api/sign/:token/signed-document
 * Download the sealed (signed) PDF. Token auth only.
 */
router.get('/:token/signed-document', async (req, res) => {
  const token = typeof req.params.token === 'string' ? req.params.token : req.params.token[0];
  const tokenResult = await validateToken(token);

  if (!tokenResult.valid) {
    res.status(401).json({ success: false, error: tokenResult.reason });
    return;
  }

  await setSigningTenantContext(tokenResult.signer!.tenantId);

  const db = getDb();
  const envelopeId = tokenResult.signer!.envelopeId;

  try {
    const [envelope] = await db.select().from(envelopes).where(eq(envelopes.id, envelopeId)).limit(1);

    if (!envelope) {
      res.status(404).json({ success: false, error: 'Envelope not found' });
      return;
    }

    if (envelope.status !== 'completed') {
      res.status(400).json({
        success: false,
        error: 'Document not yet completed. Please wait for all signers to finish.',
      });
      return;
    }

    if (!envelope.sealedKey) {
      res.status(404).json({
        success: false,
        error: 'Signed document not found. It may still be processing.',
      });
      return;
    }

    const { downloadDocument } = await import('../../storage/documentStore.js');
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
 * GET /api/sign/:token/certificate
 * Download the completion certificate. Token auth only.
 */
router.get('/:token/certificate', async (req, res) => {
  const token = typeof req.params.token === 'string' ? req.params.token : req.params.token[0];
  const tokenResult = await validateToken(token);

  if (!tokenResult.valid) {
    res.status(401).json({ success: false, error: tokenResult.reason });
    return;
  }

  await setSigningTenantContext(tokenResult.signer!.tenantId);

  const db = getDb();
  const envelopeId = tokenResult.signer!.envelopeId;

  try {
    const [envelope] = await db.select().from(envelopes).where(eq(envelopes.id, envelopeId)).limit(1);

    if (!envelope) {
      res.status(404).json({ success: false, error: 'Envelope not found' });
      return;
    }

    if (envelope.status !== 'completed') {
      res.status(400).json({
        success: false,
        error: 'Certificate not yet available. Please wait for all signers to finish.',
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

    const { downloadDocument } = await import('../../storage/documentStore.js');
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

export default router;
