/**
 * SendSign Database Seed Script
 *
 * Creates sample data for development:
 * - 1 completed envelope with 2 signers, fields, and audit events
 * - 1 in-progress envelope with 1 signed signer and 1 pending
 * - 1 template
 *
 * Usage: npx tsx src/db/seed.ts
 */

import { v4 as uuidv4 } from 'uuid';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import {
  envelopes,
  documents,
  signers,
  fields,
  auditEvents,
  templates,
} from './schema.js';

const { Pool } = pg;

// ─── Helpers ─────────────────────────────────────────────────────

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

// ─── Seed Data IDs (stable for reproducibility) ─────────────────

const ids = {
  // Completed envelope
  envelope1: uuidv4(),
  doc1: uuidv4(),
  signer1a: uuidv4(),
  signer1b: uuidv4(),
  field1a_sig: uuidv4(),
  field1a_date: uuidv4(),
  field1b_sig: uuidv4(),
  field1b_date: uuidv4(),

  // In-progress envelope
  envelope2: uuidv4(),
  doc2: uuidv4(),
  signer2a: uuidv4(),
  signer2b: uuidv4(),
  field2a_sig: uuidv4(),
  field2b_sig: uuidv4(),
  field2b_text: uuidv4(),

  // Template
  template1: uuidv4(),
};

// ─── Seed Function ───────────────────────────────────────────────

export async function seedDatabase(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://sendsign:password@localhost:5432/sendsign';

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log('Seeding SendSign database...\n');

  try {
    // Clear existing data in correct order (respect foreign keys)
    console.log('  Clearing existing data...');
    await db.delete(auditEvents);
    await db.delete(fields);
    await db.delete(signers);
    await db.delete(documents);
    await db.delete(envelopes);
    await db.delete(templates);

    // ── 1. Completed Envelope ──────────────────────────────────

    console.log('  Creating completed envelope...');
    await db.insert(envelopes).values({
      id: ids.envelope1,
      subject: 'Master Service Agreement — Acme Corp',
      message: 'Please review and sign the MSA at your earliest convenience.',
      status: 'completed',
      signingOrder: 'sequential',
      documentKey: 'docs/completed/msa-acme.pdf',
      sealedKey: 'docs/completed/msa-acme-sealed.pdf',
      completionCertKey: 'docs/completed/msa-acme-cert.pdf',
      createdBy: 'admin@sendsign.dev',
      createdAt: hoursAgo(72),
      updatedAt: hoursAgo(1),
      sentAt: hoursAgo(71),
      completedAt: hoursAgo(1),
    });

    await db.insert(documents).values({
      id: ids.doc1,
      envelopeId: ids.envelope1,
      filename: 'MSA-Acme-Corp.pdf',
      contentType: 'application/pdf',
      storagePath: 'docs/completed/msa-acme.pdf',
      documentHash: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
      order: 0,
    });

    await db.insert(signers).values([
      {
        id: ids.signer1a,
        envelopeId: ids.envelope1,
        name: 'Alice Johnson',
        email: 'alice@sendsign.dev',
        role: 'signer',
        order: 1,
        status: 'signed',
        signingToken: 'tok_completed_alice_' + ids.signer1a.slice(0, 8),
        tokenExpiresAt: hoursAgo(1),
        signedAt: hoursAgo(48),
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
      {
        id: ids.signer1b,
        envelopeId: ids.envelope1,
        name: 'Bob Martinez',
        email: 'bob@acmecorp.com',
        role: 'signer',
        order: 2,
        status: 'signed',
        signingToken: 'tok_completed_bob_' + ids.signer1b.slice(0, 8),
        tokenExpiresAt: hoursAgo(1),
        signedAt: hoursAgo(1),
        ipAddress: '198.51.100.42',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    ]);

    await db.insert(fields).values([
      {
        id: ids.field1a_sig,
        envelopeId: ids.envelope1,
        documentId: ids.doc1,
        signerId: ids.signer1a,
        type: 'signature',
        page: 5,
        x: 15.0,
        y: 75.0,
        width: 30.0,
        height: 8.0,
        required: true,
        value: 'signed',
        filledAt: hoursAgo(48),
      },
      {
        id: ids.field1a_date,
        envelopeId: ids.envelope1,
        documentId: ids.doc1,
        signerId: ids.signer1a,
        type: 'date',
        page: 5,
        x: 50.0,
        y: 75.0,
        width: 15.0,
        height: 4.0,
        required: true,
        value: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().split('T')[0],
        filledAt: hoursAgo(48),
      },
      {
        id: ids.field1b_sig,
        envelopeId: ids.envelope1,
        documentId: ids.doc1,
        signerId: ids.signer1b,
        type: 'signature',
        page: 5,
        x: 15.0,
        y: 88.0,
        width: 30.0,
        height: 8.0,
        required: true,
        value: 'signed',
        filledAt: hoursAgo(1),
      },
      {
        id: ids.field1b_date,
        envelopeId: ids.envelope1,
        documentId: ids.doc1,
        signerId: ids.signer1b,
        type: 'date',
        page: 5,
        x: 50.0,
        y: 88.0,
        width: 15.0,
        height: 4.0,
        required: true,
        value: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString().split('T')[0],
        filledAt: hoursAgo(1),
      },
    ]);

    // Audit events for completed envelope
    await db.insert(auditEvents).values([
      {
        envelopeId: ids.envelope1,
        eventType: 'created',
        eventData: { subject: 'Master Service Agreement — Acme Corp' },
        createdAt: hoursAgo(72),
      },
      {
        envelopeId: ids.envelope1,
        eventType: 'sent',
        eventData: { signerCount: 2 },
        createdAt: hoursAgo(71),
      },
      {
        envelopeId: ids.envelope1,
        signerId: ids.signer1a,
        eventType: 'opened',
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        createdAt: hoursAgo(50),
      },
      {
        envelopeId: ids.envelope1,
        signerId: ids.signer1a,
        eventType: 'viewed',
        ipAddress: '203.0.113.10',
        createdAt: hoursAgo(49),
      },
      {
        envelopeId: ids.envelope1,
        signerId: ids.signer1a,
        eventType: 'signed',
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        createdAt: hoursAgo(48),
      },
      {
        envelopeId: ids.envelope1,
        signerId: ids.signer1b,
        eventType: 'opened',
        ipAddress: '198.51.100.42',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        createdAt: hoursAgo(3),
      },
      {
        envelopeId: ids.envelope1,
        signerId: ids.signer1b,
        eventType: 'viewed',
        ipAddress: '198.51.100.42',
        createdAt: hoursAgo(2),
      },
      {
        envelopeId: ids.envelope1,
        signerId: ids.signer1b,
        eventType: 'signed',
        ipAddress: '198.51.100.42',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        createdAt: hoursAgo(1),
      },
      {
        envelopeId: ids.envelope1,
        eventType: 'sealed',
        eventData: {
          documentHash: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
        },
        createdAt: hoursAgo(1),
      },
    ]);

    // ── 2. In-Progress Envelope ────────────────────────────────

    console.log('  Creating in-progress envelope...');
    await db.insert(envelopes).values({
      id: ids.envelope2,
      subject: 'Non-Disclosure Agreement — Project Phoenix',
      message: 'Mutual NDA for the upcoming collaboration. Please sign by end of week.',
      status: 'in_progress',
      signingOrder: 'sequential',
      documentKey: 'docs/pending/nda-phoenix.pdf',
      createdBy: 'admin@sendsign.dev',
      expiresAt: hoursFromNow(48),
      createdAt: hoursAgo(24),
      updatedAt: hoursAgo(6),
      sentAt: hoursAgo(23),
    });

    await db.insert(documents).values({
      id: ids.doc2,
      envelopeId: ids.envelope2,
      filename: 'NDA-Project-Phoenix.pdf',
      contentType: 'application/pdf',
      storagePath: 'docs/pending/nda-phoenix.pdf',
      documentHash: 'b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890ab',
      order: 0,
    });

    await db.insert(signers).values([
      {
        id: ids.signer2a,
        envelopeId: ids.envelope2,
        name: 'Carol Wei',
        email: 'carol@sendsign.dev',
        role: 'signer',
        order: 1,
        status: 'signed',
        signingToken: 'tok_inprogress_carol_' + ids.signer2a.slice(0, 8),
        tokenExpiresAt: hoursFromNow(48),
        signedAt: hoursAgo(6),
        ipAddress: '192.0.2.55',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      },
      {
        id: ids.signer2b,
        envelopeId: ids.envelope2,
        name: 'David Park',
        email: 'david@partnerco.com',
        role: 'signer',
        order: 2,
        status: 'notified',
        signingToken: 'tok_inprogress_david_' + ids.signer2b.slice(0, 8),
        tokenExpiresAt: hoursFromNow(48),
      },
    ]);

    await db.insert(fields).values([
      {
        id: ids.field2a_sig,
        envelopeId: ids.envelope2,
        documentId: ids.doc2,
        signerId: ids.signer2a,
        type: 'signature',
        page: 3,
        x: 15.0,
        y: 80.0,
        width: 30.0,
        height: 8.0,
        required: true,
        value: 'signed',
        filledAt: hoursAgo(6),
      },
      {
        id: ids.field2b_sig,
        envelopeId: ids.envelope2,
        documentId: ids.doc2,
        signerId: ids.signer2b,
        type: 'signature',
        page: 3,
        x: 55.0,
        y: 80.0,
        width: 30.0,
        height: 8.0,
        required: true,
      },
      {
        id: ids.field2b_text,
        envelopeId: ids.envelope2,
        documentId: ids.doc2,
        signerId: ids.signer2b,
        type: 'text',
        page: 3,
        x: 55.0,
        y: 72.0,
        width: 30.0,
        height: 4.0,
        required: true,
      },
    ]);

    // Audit events for in-progress envelope
    await db.insert(auditEvents).values([
      {
        envelopeId: ids.envelope2,
        eventType: 'created',
        eventData: { subject: 'Non-Disclosure Agreement — Project Phoenix' },
        createdAt: hoursAgo(24),
      },
      {
        envelopeId: ids.envelope2,
        eventType: 'sent',
        eventData: { signerCount: 2 },
        createdAt: hoursAgo(23),
      },
      {
        envelopeId: ids.envelope2,
        signerId: ids.signer2a,
        eventType: 'opened',
        ipAddress: '192.0.2.55',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
        createdAt: hoursAgo(8),
      },
      {
        envelopeId: ids.envelope2,
        signerId: ids.signer2a,
        eventType: 'signed',
        ipAddress: '192.0.2.55',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
        createdAt: hoursAgo(6),
      },
    ]);

    // ── 3. Template ────────────────────────────────────────────

    console.log('  Creating sample template...');
    await db.insert(templates).values({
      id: ids.template1,
      name: 'Standard NDA',
      description: 'Mutual non-disclosure agreement template for two parties.',
      documentKey: 'templates/standard-nda.pdf',
      fieldConfig: JSON.stringify([
        {
          type: 'text',
          page: 1,
          x: 15,
          y: 30,
          width: 30,
          height: 4,
          role: 'party_a',
          label: 'Company Name',
        },
        {
          type: 'text',
          page: 1,
          x: 55,
          y: 30,
          width: 30,
          height: 4,
          role: 'party_b',
          label: 'Company Name',
        },
        {
          type: 'signature',
          page: 3,
          x: 15,
          y: 80,
          width: 30,
          height: 8,
          role: 'party_a',
          label: 'Signature',
        },
        {
          type: 'signature',
          page: 3,
          x: 55,
          y: 80,
          width: 30,
          height: 8,
          role: 'party_b',
          label: 'Signature',
        },
        {
          type: 'date',
          page: 3,
          x: 15,
          y: 90,
          width: 15,
          height: 4,
          role: 'party_a',
          label: 'Date',
        },
        {
          type: 'date',
          page: 3,
          x: 55,
          y: 90,
          width: 15,
          height: 4,
          role: 'party_b',
          label: 'Date',
        },
      ]),
      signerRoles: JSON.stringify([
        { role: 'party_a', name: 'Disclosing Party', order: 1 },
        { role: 'party_b', name: 'Receiving Party', order: 2 },
      ]),
      createdBy: 'admin@sendsign.dev',
    });

    console.log('\n✅ Seed data created successfully!');
    console.log(`   • Completed envelope: ${ids.envelope1}`);
    console.log(`   • In-progress envelope: ${ids.envelope2}`);
    console.log(`   • Template: ${ids.template1}`);
    console.log('');
  } finally {
    await pool.end();
  }
}

// ─── Run directly ────────────────────────────────────────────────

seedDatabase().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
