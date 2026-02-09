import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { envelopes, signers, auditEvents } from '../db/schema.js';
import { findExpiredEnvelopes, expireEnvelopes } from './expiryManager.js';
import { createEnvelope, sendEnvelope } from './envelopeManager.js';

describe('expiryManager (integration)', () => {
  const db = getDb();

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE audit_events, fields, signers, documents, envelopes RESTART IDENTITY CASCADE`,
    );
  });

  it('finds expired envelopes', async () => {
    // Create an envelope that expired 1 hour ago
    const pastDate = new Date(Date.now() - 60 * 60 * 1000);

    const envelope = await createEnvelope({
      subject: 'Expired Envelope',
      expiresAt: pastDate,
      signers: [{ name: 'Test', email: 'test@test.com' }],
    });

    await sendEnvelope(envelope.id);

    const expired = await findExpiredEnvelopes();
    expect(expired.length).toBeGreaterThanOrEqual(1);
    expect(expired.find((e) => e.id === envelope.id)).toBeTruthy();
  });

  it('expires envelopes and updates status', async () => {
    const pastDate = new Date(Date.now() - 60 * 60 * 1000);

    const envelope = await createEnvelope({
      subject: 'Auto Expire Test',
      expiresAt: pastDate,
      signers: [{ name: 'Test', email: 'test@test.com' }],
    });

    await sendEnvelope(envelope.id);

    const count = await expireEnvelopes();
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify status changed
    const [updated] = await db.select().from(envelopes).where(sql`${envelopes.id} = ${envelope.id}`);
    expect(updated.status).toBe('expired');
  });

  it('does not expire completed envelopes', async () => {
    const pastDate = new Date(Date.now() - 60 * 60 * 1000);

    const envelope = await createEnvelope({
      subject: 'Completed No Expire',
      expiresAt: pastDate,
      signers: [{ name: 'Test', email: 'test@test.com' }],
    });

    // Mark as completed directly
    await db.update(envelopes).set({ status: 'completed' }).where(sql`${envelopes.id} = ${envelope.id}`);

    const expired = await findExpiredEnvelopes();
    expect(expired.find((e) => e.id === envelope.id)).toBeUndefined();
  });
});
