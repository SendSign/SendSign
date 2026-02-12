/**
 * Seed Demo Script
 *
 * Creates a sample envelope with documents and signers,
 * then prints the signing URL to the console.
 *
 * Usage: npm run seed-demo
 */

// Load .env BEFORE any other imports that might read env vars
import 'dotenv/config';

import crypto from 'crypto';
import { getDb, closeDb } from '../src/db/connection.js';
import {
  envelopes,
  signers,
  documents,
  fields,
  organizations,
  apiKeys,
  tenants,
} from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { uploadDocument } from '../src/storage/documentStore.js';
import { hashDocument } from '../src/crypto/hasher.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// ─── Debug Logging ──────────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL || 'NOT SET';
const redactedUrl = dbUrl.replace(/:([^@]+)@/, ':****@');
console.log(`🔍 DATABASE_URL:      ${redactedUrl}`);
console.log(`🔍 ENCRYPTION_KEY:    ${(process.env.ENCRYPTION_KEY || '').length} chars`);
console.log(`🔍 STORAGE_TYPE:      ${process.env.STORAGE_TYPE || 'not set (defaults to local)'}`);
console.log('');

// ─── Helpers ────────────────────────────────────────────────────────

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function createSamplePDF(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 750;

  // Header
  page.drawText('NON-DISCLOSURE AGREEMENT', {
    x: 150, y,
    size: 18, font: boldFont,
    color: rgb(0.1, 0.3, 0.6),
  });

  y -= 40;

  const lines = [
    'This Non-Disclosure Agreement (the "Agreement") is entered into as of the date',
    'signed below between the parties identified below.',
    '',
    'WHEREAS, the parties wish to explore a business opportunity of mutual interest',
    'and in connection with this opportunity, each party may disclose to the other',
    'certain confidential technical and business information that the disclosing party',
    'desires the receiving party to treat as confidential.',
    '',
    'NOW, THEREFORE, the parties agree as follows:',
    '',
    '1. "Confidential Information" means any information disclosed by either party to',
    '   the other party, either directly or indirectly, in writing, orally or by',
    '   inspection of tangible objects.',
    '',
    '2. The receiving party shall hold and maintain the Confidential Information in',
    '   strictest confidence for the sole and exclusive benefit of the disclosing party.',
    '',
    '3. This Agreement shall remain in effect for a period of three (3) years from',
    '   the date of execution.',
    '',
    '',
    'By signing below, you acknowledge that you have read, understood, and agree',
    'to be bound by the terms of this Agreement.',
    '',
    '',
    '___________________________________          _______________',
    'Signature                                     Date',
    '',
    '___________________________________          _______________',
    'Full Name                                     Company',
  ];

  for (const line of lines) {
    page.drawText(line, {
      x: 50, y,
      size: 11, font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 16;
  }

  return Buffer.from(await pdfDoc.save());
}

// ─── Main Seed Function ─────────────────────────────────────────────

async function seedDemo() {
  console.log('🌱 Starting SendSign demo seed...\n');

  const db = getDb();

  // ── 0. Default Tenant ─────────────────────────────────────────────

  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
  console.log('🏢 Ensuring default tenant exists...');
  let tenant;
  const existingTenants = await db.select().from(tenants).where(eq(tenants.id, DEFAULT_TENANT_ID)).limit(1);

  if (existingTenants.length > 0) {
    tenant = existingTenants[0];
    console.log(`   Using existing: ${tenant.name} (${tenant.id})`);
  } else {
    [tenant] = await db
      .insert(tenants)
      .values({
        id: DEFAULT_TENANT_ID,
        name: 'Default Tenant',
        slug: 'default',
        plan: 'enterprise',
        status: 'active',
        envelopeLimit: 999999,
        userLimit: 999999,
        templateLimit: 999999,
        bulkSendLimit: 999999,
        auditRetentionDays: 365,
        licenseType: 'agpl',
      })
      .returning();
    console.log(`   Created: ${tenant.name} (${tenant.id})`);
  }

  // ── 1. Organization ─────────────────────────────────────────────

  console.log('📦 Creating organization...');
  let org;
  const existingOrgs = await db.select().from(organizations).limit(1);

  if (existingOrgs.length > 0) {
    org = existingOrgs[0];
    console.log(`   Using existing: ${org.name} (${org.id})`);
  } else {
    [org] = await db
      .insert(organizations)
      .values({
        tenantId: DEFAULT_TENANT_ID,
        name: 'Demo Company',
        slug: 'demo-company',
        plan: 'pro',
        billingEmail: 'admin@demo.sendsign.local',
      })
      .returning();
    console.log(`   Created: ${org.name} (${org.id})`);
  }

  // ── 2. API Key ──────────────────────────────────────────────────
  //
  // Schema: api_keys(id, organization_id, key_hash, name, permissions,
  //                   last_used_at, expires_at, created_at)
  //
  // The table stores a SHA-256 hash, not the raw key.
  // We generate the raw key, hash it, store the hash, and print the raw key.

  console.log('\n🔑 Setting up API key...');
  const existingKeys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, org.id))
    .limit(1);

  let rawApiKey: string;

  if (existingKeys.length > 0) {
    console.log('   Using existing API key (hash on file).');
    console.log('   If you forgot the raw key, delete api_keys rows and re-run.');
    rawApiKey = '(existing — see above)';
  } else {
    rawApiKey = `sendsign_${uuidv4().replace(/-/g, '')}`;
    const keyHash = hashApiKey(rawApiKey);

    await db
      .insert(apiKeys)
      .values({
        tenantId: DEFAULT_TENANT_ID,
        organizationId: org.id,
        keyHash,
        name: 'Demo API Key',
        permissions: ['all'],
      })
      .returning();

    console.log(`   Created API key: ${rawApiKey.substring(0, 24)}...`);
  }

  // ── 3. Generate + upload PDF ────────────────────────────────────

  console.log('\n📄 Generating sample NDA document...');
  const samplePdf = await createSamplePDF();
  const docHash = hashDocument(samplePdf);

  const storageKey = await uploadDocument(samplePdf, {
    filename: 'NDA_Agreement.pdf',
    contentType: 'application/pdf',
  });
  console.log(`   Uploaded → ${storageKey}`);

  // ── 4. Envelope ─────────────────────────────────────────────────

  console.log('\n✉️  Creating envelope...');
  const [envelope] = await db
    .insert(envelopes)
    .values({
      tenantId: DEFAULT_TENANT_ID,
      organizationId: org.id,
      subject: 'Demo NDA — Please Review and Sign',
      message:
        'Please review this Non-Disclosure Agreement and sign if you agree to the terms.',
      status: 'sent',
      signingOrder: 'sequential',
      createdBy: 'admin@demo.sendsign.local',
      sentAt: new Date(),
    })
    .returning();
  console.log(`   Envelope: ${envelope.id}`);

  // ── 5. Document ─────────────────────────────────────────────────

  console.log('\n📎 Attaching document...');
  const [doc] = await db
    .insert(documents)
    .values({
      tenantId: DEFAULT_TENANT_ID,
      envelopeId: envelope.id,
      filename: 'NDA_Agreement.pdf',
      contentType: 'application/pdf',
      storagePath: storageKey,
      documentHash: docHash,
      order: 0,
    })
    .returning();
  console.log(`   Document: ${doc.id}`);

  // ── 6. Signer ──────────────────────────────────────────────────

  console.log('\n👤 Creating signer...');
  const signerEmail = 'demo.signer@example.com';
  const signerName = 'Alex Demo';
  const signingToken = uuidv4();
  const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [signer] = await db
    .insert(signers)
    .values({
      tenantId: DEFAULT_TENANT_ID,
      envelopeId: envelope.id,
      name: signerName,
      email: signerEmail,
      role: 'signer',
      order: 1,
      status: 'notified',
      signingToken,
      tokenExpiresAt: tokenExpiry,
    })
    .returning();
  console.log(`   Signer: ${signer.name} <${signer.email}>`);

  // ── 7. Fields ───────────────────────────────────────────────────
  //
  // Schema field types (enum): signature, initial, date, text,
  //   checkbox, radio, dropdown, number, currency, calculated, attachment
  //
  // There is NO "label" column — remove it.

  console.log('\n📝 Adding signature fields...');
  await db.insert(fields).values([
    {
      tenantId: DEFAULT_TENANT_ID,
      envelopeId: envelope.id,
      documentId: doc.id,
      signerId: signer.id,
      type: 'signature',
      page: 0,
      x: 50,
      y: 150,
      width: 200,
      height: 50,
      required: true,
    },
    {
      tenantId: DEFAULT_TENANT_ID,
      envelopeId: envelope.id,
      documentId: doc.id,
      signerId: signer.id,
      type: 'date',
      page: 0,
      x: 350,
      y: 150,
      width: 120,
      height: 30,
      required: true,
    },
    {
      tenantId: DEFAULT_TENANT_ID,
      envelopeId: envelope.id,
      documentId: doc.id,
      signerId: signer.id,
      type: 'text',
      page: 0,
      x: 50,
      y: 100,
      width: 200,
      height: 30,
      required: true,
    },
    {
      tenantId: DEFAULT_TENANT_ID,
      envelopeId: envelope.id,
      documentId: doc.id,
      signerId: signer.id,
      type: 'text',
      page: 0,
      x: 350,
      y: 100,
      width: 200,
      height: 30,
      required: true,
    },
  ]);
  console.log('   4 fields added (signature, date, name, company)');

  // ── 8. Print Summary ───────────────────────────────────────────

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const signingUrl = `${baseUrl}/sign/${signingToken}`;

  console.log('\n' + '═'.repeat(70));
  console.log('  DEMO SEEDING COMPLETE');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`  Organization:  ${org.name}`);
  console.log(`  Envelope ID:   ${envelope.id}`);
  console.log(`  Signer:        ${signer.name} <${signer.email}>`);
  console.log(`  Status:        ${envelope.status}`);
  console.log(`  Fields:        4 (signature, date, name, company)`);
  console.log('');
  console.log('  SIGNING URL:');
  console.log(`  ${signingUrl}`);
  console.log('');
  if (rawApiKey && rawApiKey !== '(existing — see above)') {
    console.log(`  API KEY (save this):  ${rawApiKey}`);
    console.log('');
  }
  console.log('  Next steps:');
  console.log('    1. Start the server:  npm run dev');
  console.log('    2. Open the signing URL in your browser');
  console.log('    3. Fill out the fields and sign the document');
  console.log('');
  console.log('═'.repeat(70));
}

// ─── Run ────────────────────────────────────────────────────────────

seedDemo()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\n❌ Seed script failed:', error);
    await closeDb().catch(() => {});
    process.exit(1);
  });
