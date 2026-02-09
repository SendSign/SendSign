import { lt, and, notInArray, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { envelopes } from '../db/schema.js';
import { deleteDocument } from './documentStore.js';
import { logEvent } from '../audit/auditLogger.js';

const DEFAULT_RETENTION_DAYS = 2555; // ~7 years

function getRetentionDays(): number {
  const envVal = process.env.RETENTION_PERIOD_DAYS;
  return envVal ? parseInt(envVal, 10) : DEFAULT_RETENTION_DAYS;
}

/**
 * Find envelopes whose documents are past the retention period.
 */
export async function checkExpiredDocuments(): Promise<string[]> {
  const db = getDb();
  const retentionDays = getRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const expired = await db
    .select({ id: envelopes.id })
    .from(envelopes)
    .where(
      and(
        lt(envelopes.completedAt, cutoff),
        eq(envelopes.status, 'completed'),
      ),
    );

  return expired.map((e) => e.id);
}

/**
 * Purge expired documents from storage.
 * Returns the count of deleted documents.
 */
export async function purgeExpired(): Promise<number> {
  const expiredIds = await checkExpiredDocuments();
  const db = getDb();
  let deleted = 0;

  for (const envelopeId of expiredIds) {
    try {
      const [envelope] = await db
        .select()
        .from(envelopes)
        .where(eq(envelopes.id, envelopeId));

      if (!envelope) continue;

      // Delete stored documents
      if (envelope.documentKey) {
        try { await deleteDocument(envelope.documentKey); } catch { /* already gone */ }
      }
      if (envelope.sealedKey) {
        try { await deleteDocument(envelope.sealedKey); } catch { /* already gone */ }
      }
      if (envelope.completionCertKey) {
        try { await deleteDocument(envelope.completionCertKey); } catch { /* already gone */ }
      }

      await logEvent({
        envelopeId,
        eventType: 'accessed',
        eventData: { action: 'retention_purge' },
      });

      deleted++;
    } catch (error) {
      console.error(`Failed to purge envelope ${envelopeId}:`, error);
    }
  }

  return deleted;
}

/**
 * Assign a retention policy to an envelope.
 */
export async function assignPolicy(envelopeId: string, policyId: string): Promise<void> {
  const db = getDb();
  await db
    .update(envelopes)
    .set({ metadata: sql`jsonb_set(COALESCE(metadata, '{}'), '{retentionPolicyId}', ${JSON.stringify(policyId)}::jsonb)` })
    .where(eq(envelopes.id, envelopeId));
}

/**
 * Get envelopes expiring within the given number of days.
 */
export async function getExpiringDocuments(
  daysAhead: number,
): Promise<Array<{ envelopeId: string; expiresAt: Date }>> {
  const retentionDays = getRetentionDays();
  const cutoffStart = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoffEnd = new Date(Date.now() - (retentionDays - daysAhead) * 24 * 60 * 60 * 1000);
  const db = getDb();

  const results = await db
    .select({ id: envelopes.id, completedAt: envelopes.completedAt })
    .from(envelopes)
    .where(
      and(
        lt(envelopes.completedAt, cutoffEnd),
        eq(envelopes.status, 'completed'),
      ),
    );

  return results
    .filter((r) => r.completedAt !== null)
    .map((r) => ({
      envelopeId: r.id,
      expiresAt: new Date(r.completedAt!.getTime() + retentionDays * 24 * 60 * 60 * 1000),
    }));
}

export interface RetentionReport {
  total: number;
  expired: number;
  expiringSoon: number;
  deleted: number;
}

/**
 * Process retention: check and purge expired documents.
 */
export async function processRetention(): Promise<RetentionReport> {
  const expired = await checkExpiredDocuments();
  const expiringSoon = await getExpiringDocuments(30);
  const deleted = await purgeExpired();

  return {
    total: expired.length + expiringSoon.length,
    expired: expired.length,
    expiringSoon: expiringSoon.length,
    deleted,
  };
}

/**
 * Generate a retention report PDF showing all documents and their retention status.
 */
export async function generateRetentionReport(): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const db = getDb();

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 50;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawText = (text: string, options: { size?: number; font?: typeof font; indent?: number } = {}) => {
    const size = options.size ?? 10;
    const f = options.font ?? font;
    const indent = options.indent ?? 0;

    page.drawText(text, {
      x: margin + indent,
      y,
      size,
      font: f,
      color: rgb(0, 0, 0),
    });

    y -= size + 4;

    if (y < margin + 30) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  // Header
  drawText('DOCUMENT RETENTION REPORT', { size: 18, font: boldFont });
  drawText(`Generated: ${new Date().toISOString()}`, { size: 9 });
  y -= 10;

  // Get all completed envelopes
  const completedEnvelopes = await db
    .select()
    .from(envelopes)
    .where(sql`${envelopes.status} = 'completed'`);

  drawText(`Total Completed Documents: ${completedEnvelopes.length}`, { size: 12, font: boldFont });
  y -= 10;

  const retentionDays = getRetentionDays();

  // List documents with expiry dates
  for (const envelope of completedEnvelopes) {
    if (!envelope.completedAt) continue;

    const expiryDate = new Date(envelope.completedAt);
    expiryDate.setDate(expiryDate.getDate() + retentionDays);

    const daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const status = daysRemaining < 0 ? 'EXPIRED' : daysRemaining < 30 ? 'EXPIRING SOON' : 'OK';

    const subject = envelope.subject.substring(0, 45).padEnd(47);
    const expiry = expiryDate.toISOString().split('T')[0];
    const line = `${subject} ${expiry}  ${status}`;

    drawText(line, { indent: 5, size: 8 });
  }

  y -= 10;
  drawText('Report generated by CoSeal v0.1.0', { size: 8 });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
