/**
 * GDPR & CCPA compliance endpoints.
 *
 * These endpoints handle:
 * - Subject Access Requests (GDPR Article 15 / CCPA Section 1798.100)
 * - Right to Erasure (GDPR Article 17)
 * - Data Portability (GDPR Article 20)
 * - CCPA Do Not Sell (CCPA Section 1798.120)
 * - Consent management
 */

import { Router } from 'express';
import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/rbac.js';
import { getDb } from '../../db/connection.js';
import {
  users,
  envelopes,
  signers,
  auditEvents,
  fields,
  documents,
  identityVerifications,
} from '../../db/schema.js';
import { logEvent } from '../../audit/auditLogger.js';

const router = Router();

// ─── GDPR: Subject Access Request (Data Export) ──────────────────────

const sarSchema = z.object({
  email: z.string().email('Valid email required'),
});

/**
 * POST /api/compliance/gdpr/export
 * Export all personal data associated with an email address.
 * GDPR Article 15 (Right of Access) & Article 20 (Data Portability)
 */
router.post('/gdpr/export', requireRole('admin'), validate(sarSchema), async (req, res) => {
  const { email } = req.body;
  const db = getDb();

  try {
    // Find user record
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

    // Find all signer records (as a recipient, not just as a user)
    const signerRecords = await db
      .select({
        id: signers.id,
        envelopeId: signers.envelopeId,
        name: signers.name,
        email: signers.email,
        role: signers.role,
        status: signers.status,
        signedAt: signers.signedAt,
        consentedAt: signers.consentedAt,
        ipAddress: signers.ipAddress,
        geolocation: signers.geolocation,
        createdAt: signers.createdAt,
      })
      .from(signers)
      .where(eq(signers.email, email.toLowerCase()));

    // Find all envelopes created by or involving this user
    const signerEnvelopeIds = signerRecords.map(s => s.envelopeId);
    const createdEnvelopes = user
      ? await db
          .select({
            id: envelopes.id,
            subject: envelopes.subject,
            status: envelopes.status,
            createdBy: envelopes.createdBy,
            createdAt: envelopes.createdAt,
            sentAt: envelopes.sentAt,
            completedAt: envelopes.completedAt,
          })
          .from(envelopes)
          .where(or(eq(envelopes.createdBy, user.id), eq(envelopes.createdBy, user.email)))
      : [];

    // Find all audit events involving this user's signers
    const signerIds = signerRecords.map(s => s.id);
    let auditRecords: Array<Record<string, unknown>> = [];
    for (const signerId of signerIds) {
      const events = await db
        .select({
          id: auditEvents.id,
          envelopeId: auditEvents.envelopeId,
          eventType: auditEvents.eventType,
          ipAddress: auditEvents.ipAddress,
          geolocation: auditEvents.geolocation,
          createdAt: auditEvents.createdAt,
        })
        .from(auditEvents)
        .where(eq(auditEvents.signerId, signerId));
      auditRecords = auditRecords.concat(events);
    }

    // Find identity verifications
    let identityRecords: Array<Record<string, unknown>> = [];
    for (const signerId of signerIds) {
      const verifications = await db
        .select({
          id: identityVerifications.id,
          method: identityVerifications.method,
          status: identityVerifications.status,
          verifiedAt: identityVerifications.verifiedAt,
          createdAt: identityVerifications.createdAt,
        })
        .from(identityVerifications)
        .where(eq(identityVerifications.signerId, signerId));
      identityRecords = identityRecords.concat(verifications);
    }

    // Mark data export requested
    if (user) {
      await db.update(users).set({ dataExportRequestedAt: new Date() }).where(eq(users.id, user.id));
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      dataSubject: email,
      gdprArticle: 'Article 15 - Right of Access / Article 20 - Data Portability',
      userProfile: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            organizationId: user.organizationId,
            createdAt: user.createdAt,
            gdprConsentAt: user.gdprConsentAt,
            ccpaOptOut: user.ccpaOptOut,
            marketingConsent: user.marketingConsent,
          }
        : null,
      signingActivity: signerRecords,
      envelopesCreated: createdEnvelopes,
      auditTrail: auditRecords,
      identityVerifications: identityRecords,
    };

    res.json({ success: true, data: exportData });
  } catch (error) {
    console.error('GDPR export error:', error);
    res.status(500).json({ success: false, error: 'Failed to export data' });
  }
});

// ─── GDPR: Right to Erasure ──────────────────────────────────────────

const erasureSchema = z.object({
  email: z.string().email('Valid email required'),
  reason: z.string().optional(),
  retainLegalHolds: z.boolean().optional().default(true),
});

/**
 * POST /api/compliance/gdpr/erase
 * Anonymize/delete personal data for a given email.
 * GDPR Article 17 (Right to Erasure / Right to be Forgotten)
 *
 * NOTE: Legal hold envelopes (completed, used in disputes) are retained
 * per Article 17(3)(e) — necessary for legal claims.
 */
router.post('/gdpr/erase', requireRole('admin'), validate(erasureSchema), async (req, res) => {
  const { email, reason, retainLegalHolds } = req.body;
  const db = getDb();

  try {
    const anonymized = `[erased-${Date.now()}]`;
    const anonymizedEmail = `erased-${Date.now()}@gdpr.deleted`;
    let signerCount = 0;
    let userErased = false;

    // Anonymize signer records
    const signerRecords = await db
      .select()
      .from(signers)
      .where(eq(signers.email, email.toLowerCase()));

    for (const signer of signerRecords) {
      // Check if this is a legal hold envelope
      if (retainLegalHolds) {
        const [envelope] = await db
          .select({ status: envelopes.status })
          .from(envelopes)
          .where(eq(envelopes.id, signer.envelopeId))
          .limit(1);

        if (envelope && envelope.status === 'completed') {
          // Retain but anonymize identifying data
          await db
            .update(signers)
            .set({
              name: '[Redacted per GDPR Art. 17]',
              email: anonymizedEmail,
              signatureImage: null,
              ipAddress: null,
              userAgent: null,
              geolocation: null,
              consentUserAgent: null,
            })
            .where(eq(signers.id, signer.id));
          signerCount++;
          continue;
        }
      }

      // Fully anonymize non-legal-hold records
      await db
        .update(signers)
        .set({
          name: anonymized,
          email: anonymizedEmail,
          signatureImage: null,
          ipAddress: null,
          userAgent: null,
          geolocation: null,
          consentUserAgent: null,
          signingToken: null,
          tokenExpiresAt: null,
        })
        .where(eq(signers.id, signer.id));
      signerCount++;
    }

    // Anonymize audit events containing this user's IP/agent
    const signerIds = signerRecords.map(s => s.id);
    for (const signerId of signerIds) {
      await db
        .update(auditEvents)
        .set({
          ipAddress: null,
          userAgent: null,
          geolocation: null,
        })
        .where(eq(auditEvents.signerId, signerId));
    }

    // Anonymize or deactivate user account
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (user) {
      await db
        .update(users)
        .set({
          name: anonymized,
          email: anonymizedEmail,
          passwordHash: null,
          ssoSubject: null,
          isActive: false,
          erasureRequestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      userErased = true;
    }

    // Log the erasure event (without PII)
    if (signerRecords.length > 0) {
      await logEvent({
        envelopeId: signerRecords[0].envelopeId,
        eventType: 'accessed',
        eventData: {
          action: 'gdpr_erasure',
          reason: reason || 'Data subject request',
          signersAnonymized: signerCount,
          userErased,
        },
        ipAddress: req.ip ?? '',
      });
    }

    res.json({
      success: true,
      data: {
        signersAnonymized: signerCount,
        userAccountErased: userErased,
        legalHoldsRetained: retainLegalHolds,
        note: retainLegalHolds
          ? 'Completed envelope records were anonymized but retained per GDPR Article 17(3)(e)'
          : 'All records fully erased',
      },
    });
  } catch (error) {
    console.error('GDPR erasure error:', error);
    res.status(500).json({ success: false, error: 'Failed to process erasure request' });
  }
});

// ─── CCPA: Do Not Sell ───────────────────────────────────────────────

const ccpaOptOutSchema = z.object({
  email: z.string().email('Valid email required'),
  optOut: z.boolean(),
});

/**
 * POST /api/compliance/ccpa/do-not-sell
 * CCPA Section 1798.120 — opt out of sale of personal information.
 */
router.post('/ccpa/do-not-sell', validate(ccpaOptOutSchema), async (req, res) => {
  const { email, optOut } = req.body;
  const db = getDb();

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      res.status(404).json({ success: false, error: 'No account found with this email' });
      return;
    }

    await db
      .update(users)
      .set({ ccpaOptOut: optOut, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    res.json({
      success: true,
      data: {
        email: user.email,
        ccpaOptOut: optOut,
        effectiveDate: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('CCPA opt-out error:', error);
    res.status(500).json({ success: false, error: 'Failed to process opt-out request' });
  }
});

/**
 * GET /api/compliance/ccpa/status?email=...
 * Check CCPA opt-out status.
 */
router.get('/ccpa/status', async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email : '';
  if (!email) {
    res.status(400).json({ success: false, error: 'Email parameter required' });
    return;
  }

  try {
    const db = getDb();
    const [user] = await db
      .select({ ccpaOptOut: users.ccpaOptOut })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    res.json({
      success: true,
      data: {
        email,
        ccpaOptOut: user?.ccpaOptOut ?? false,
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to check status' });
  }
});

// ─── GDPR: Consent Management ────────────────────────────────────────

const consentSchema = z.object({
  gdprConsent: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
  privacyPolicyVersion: z.string().optional(),
});

/**
 * POST /api/compliance/consent
 * Record or update user consent preferences.
 */
router.post('/consent', async (req, res) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const { gdprConsent, marketingConsent, privacyPolicyVersion } = req.body;
  const db = getDb();

  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (gdprConsent !== undefined) {
      updates.gdprConsentAt = gdprConsent ? new Date() : null;
      updates.gdprConsentVersion = privacyPolicyVersion || '1.0';
    }
    if (marketingConsent !== undefined) {
      updates.marketingConsent = marketingConsent;
    }
    if (privacyPolicyVersion !== undefined) {
      updates.privacyPolicyVersion = privacyPolicyVersion;
    }

    await db.update(users).set(updates).where(eq(users.id, req.user.id));

    res.json({ success: true, data: { updated: Object.keys(updates).filter(k => k !== 'updatedAt') } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update consent' });
  }
});

// ─── Audit Chain Verification ────────────────────────────────────────

/**
 * GET /api/compliance/audit-integrity/:envelopeId
 * Verify the integrity of the audit trail hash chain for an envelope.
 */
router.get('/audit-integrity/:envelopeId', requireRole('admin'), async (req, res) => {
  const db = getDb();
  const envelopeId = req.params.envelopeId as string;

  try {
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.envelopeId, envelopeId))
      .orderBy(auditEvents.createdAt);

    let chainValid = true;
    let brokenAt: string | null = null;

    for (let i = 1; i < events.length; i++) {
      const current = events[i];
      const previous = events[i - 1];

      if (current.previousHash && previous.eventHash) {
        if (current.previousHash !== previous.eventHash) {
          chainValid = false;
          brokenAt = current.id;
          break;
        }
      }
    }

    res.json({
      success: true,
      data: {
        envelopeId,
        totalEvents: events.length,
        chainIntact: chainValid,
        brokenAtEventId: brokenAt,
        firstEvent: events[0]?.id || null,
        lastEvent: events[events.length - 1]?.id || null,
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to verify audit integrity' });
  }
});

export default router;
