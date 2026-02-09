import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection.js';
import {
  createEnvelope,
  sendEnvelope,
  voidEnvelope,
  completeEnvelope,
  getEnvelope,
  listEnvelopes,
} from './envelopeManager.js';
import { envelopes, signers, fields, documents, auditEvents } from '../db/schema.js';

describe('envelopeManager (integration)', () => {
  const db = getDb();
  let docId: string;

  beforeEach(async () => {
    // Clean up all tables
    await db.execute(
      sql`TRUNCATE TABLE audit_events, fields, signers, documents, envelopes RESTART IDENTITY CASCADE`,
    );

    // Create a test envelope and document to satisfy FK constraints for fields
    // We need a document for field creation
    const envId = uuidv4();
    docId = uuidv4();

    await db.insert(envelopes).values({
      id: envId,
      subject: 'Prereq Envelope',
      status: 'draft',
      createdBy: 'test',
    });

    await db.insert(documents).values({
      id: docId,
      envelopeId: envId,
      filename: 'test.pdf',
      storagePath: 'documents/test',
      documentHash: 'abc123',
    });
  });

  it('creates an envelope with signers', async () => {
    const result = await createEnvelope({
      subject: 'Test NDA',
      message: 'Please sign this NDA',
      signers: [
        { name: 'Alice', email: 'alice@test.com', order: 1 },
        { name: 'Bob', email: 'bob@test.com', order: 2 },
      ],
    });

    expect(result.id).toBeTruthy();
    expect(result.subject).toBe('Test NDA');
    expect(result.status).toBe('draft');
    expect(result.signers).toHaveLength(2);
    expect(result.signers[0].name).toBe('Alice');
  });

  it('sends an envelope (generates tokens, updates status)', async () => {
    const envelope = await createEnvelope({
      subject: 'Send Test',
      signers: [
        { name: 'Charlie', email: 'charlie@test.com' },
      ],
    });

    await sendEnvelope(envelope.id);

    const updated = await getEnvelope(envelope.id);
    expect(updated?.status).toBe('sent');
    expect(updated?.sentAt).toBeTruthy();
    expect(updated?.signers[0].status).toBe('sent');
    expect(updated?.signers[0].signingToken).toBeTruthy();
  });

  it('voids an envelope', async () => {
    const envelope = await createEnvelope({
      subject: 'Void Test',
      signers: [{ name: 'Dave', email: 'dave@test.com' }],
    });

    await sendEnvelope(envelope.id);
    await voidEnvelope(envelope.id, 'Changed requirements');

    const updated = await getEnvelope(envelope.id);
    expect(updated?.status).toBe('voided');
  });

  it('prevents voiding a completed envelope', async () => {
    const envelope = await createEnvelope({
      subject: 'Complete Then Void',
      signers: [{ name: 'Eve', email: 'eve@test.com' }],
    });

    await completeEnvelope(envelope.id);
    await expect(voidEnvelope(envelope.id)).rejects.toThrow('Cannot void');
  });

  it('completes an envelope', async () => {
    const envelope = await createEnvelope({
      subject: 'Complete Test',
      signers: [{ name: 'Frank', email: 'frank@test.com' }],
    });

    await completeEnvelope(envelope.id);

    const updated = await getEnvelope(envelope.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.completedAt).toBeTruthy();
  });

  it('lists envelopes with filters', async () => {
    await createEnvelope({ subject: 'List Test 1', signers: [{ name: 'A', email: 'a@test.com' }] });
    await createEnvelope({ subject: 'List Test 2', signers: [{ name: 'B', email: 'b@test.com' }] });

    const all = await listEnvelopes();
    // +1 for the prereq envelope
    expect(all.total).toBeGreaterThanOrEqual(2);

    const filtered = await listEnvelopes({ search: 'List Test 1' });
    expect(filtered.envelopes[0].subject).toBe('List Test 1');
  });

  it('prevents sending a non-draft envelope', async () => {
    const envelope = await createEnvelope({
      subject: 'Double Send',
      signers: [{ name: 'Grace', email: 'grace@test.com' }],
    });

    await sendEnvelope(envelope.id);
    await expect(sendEnvelope(envelope.id)).rejects.toThrow('not in draft');
  });
});
