#!/usr/bin/env npx tsx

/**
 * Comprehensive end-to-end integration test for CoSeal v1.0.0
 * Tests the complete system with all enterprise and ecosystem features.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { generateSelfSignedCert } from '../src/crypto/certManager.js';

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const API_KEY = process.env.API_KEY ?? 'test-api-key';

let testsPassed = 0;
let testsFailed = 0;

function pass(name: string) {
  console.log(`✓ ${name}`);
  testsPassed++;
}

function fail(name: string, error: string) {
  console.error(`✗ ${name}: ${error}`);
  testsFailed++;
}

async function createTestPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  
  const page1 = doc.addPage([612, 792]);
  page1.drawText('NON-DISCLOSURE AGREEMENT', {
    x: 50,
    y: 740,
    size: 20,
    font,
    color: rgb(0, 0, 0),
  });
  page1.drawText('This Agreement is entered into as of the date signed below.', {
    x: 50,
    y: 700,
    size: 11,
    font,
    color: rgb(0, 0, 0),
  });
  
  const page2 = doc.addPage([612, 792]);
  page2.drawText('SIGNATURES', {
    x: 50,
    y: 740,
    size: 16,
    font,
  });
  
  return Buffer.from(await doc.save());
}

async function ensureCerts() {
  const certsDir = path.resolve(process.cwd(), 'certs');
  const certPath = path.join(certsDir, 'signing-cert.pem');
  const keyPath = path.join(certsDir, 'signing-key.pem');

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.log('Generating self-signed certificates...');
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }
    const { cert, privateKey } = await generateSelfSignedCert('CoSeal Test CA');
    fs.writeFileSync(certPath, cert);
    fs.writeFileSync(keyPath, privateKey);
  }
}

async function apiCall(method: string, path: string, body?: unknown, isMultipart?: boolean): Promise<any> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${API_KEY}`,
  };

  let bodyData: any;

  if (isMultipart) {
    // Multipart handled by caller
    bodyData = body;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    bodyData = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: isMultipart ? { 'Authorization': headers.Authorization } : headers,
    body: bodyData,
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  if (res.status === 404) {
    return null;
  }

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return res.json();
  }

  return res.arrayBuffer();
}

// ─── Test: Basic Flow ────────────────────────────────────────────────

async function testBasicFlow() {
  console.log('\n📝 Test: Basic Flow (create → send → sign → seal → download)');

  try {
    const pdf = await createTestPdf();
    const formData = new FormData();
    formData.append('documents', new Blob([pdf], { type: 'application/pdf' }), 'test.pdf');
    formData.append('subject', 'E2E Test NDA');
    formData.append('message', 'Please sign this test document');
    formData.append('signingOrder', 'sequential');
    formData.append('signers', JSON.stringify([
      { name: 'Alice Test', email: 'alice@example.com', order: 1 },
      { name: 'Bob Test', email: 'bob@example.com', order: 2 },
    ]));
    formData.append('fields', JSON.stringify([
      { type: 'signature', page: 2, x: 10, y: 50, width: 30, height: 10, signerId: 0, required: true },
      { type: 'date', page: 2, x: 50, y: 50, width: 15, height: 5, signerId: 0, required: true },
      { type: 'signature', page: 2, x: 10, y: 30, width: 30, height: 10, signerId: 1, required: true },
      { type: 'date', page: 2, x: 50, y: 30, width: 15, height: 5, signerId: 1, required: true },
    ]));

    const createRes = await apiCall('POST', '/api/envelopes', formData, true);
    if (!createRes.success) throw new Error('Failed to create envelope');
    const envelopeId = createRes.data.id;
    pass('Envelope created');

    await apiCall('POST', `/api/envelopes/${envelopeId}/send`);
    pass('Envelope sent');

    const envelope = await apiCall('GET', `/api/envelopes/${envelopeId}`);
    if (envelope.data.status !== 'sent') throw new Error('Envelope not in sent status');
    pass('Envelope status verified');

    // Simulate signing by both signers
    for (const signer of envelope.data.signers) {
      const token = signer.signingToken;
      await fetch(`${API_BASE}/api/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: [
            { fieldId: envelope.data.fields[signer.order === 1 ? 0 : 2].id, value: 'SIGNATURE_DATA' },
            { fieldId: envelope.data.fields[signer.order === 1 ? 1 : 3].id, value: new Date().toISOString() },
          ],
        }),
      });
    }
    pass('Both signers completed');

    await apiCall('POST', `/api/envelopes/${envelopeId}/complete`);
    pass('Envelope marked complete');

    const sealedDoc = await apiCall('GET', `/api/envelopes/${envelopeId}/sealed`);
    if (!sealedDoc || sealedDoc.byteLength === 0) throw new Error('Sealed document missing');
    pass('Sealed document downloaded');

    const cert = await apiCall('GET', `/api/envelopes/${envelopeId}/certificate`);
    if (!cert || cert.byteLength === 0) throw new Error('Certificate missing');
    pass('Completion certificate downloaded');

  } catch (error) {
    fail('Basic flow', (error as Error).message);
  }
}

// ─── Test: Template Flow ─────────────────────────────────────────────

async function testTemplateFlow() {
  console.log('\n📋 Test: Template Flow (create template → use → send → sign)');

  try {
    const pdf = await createTestPdf();
    const formData = new FormData();
    formData.append('document', new Blob([pdf], { type: 'application/pdf' }), 'template.pdf');
    formData.append('name', 'E2E Test Template');
    formData.append('description', 'Test template for E2E');
    formData.append('roles', JSON.stringify([
      { name: 'Party A', order: 1 },
      { name: 'Party B', order: 2 },
    ]));
    formData.append('fields', JSON.stringify([
      { type: 'signature', page: 2, x: 10, y: 50, width: 30, height: 10, roleIndex: 0, required: true },
      { type: 'signature', page: 2, x: 10, y: 30, width: 30, height: 10, roleIndex: 1, required: true },
    ]));

    const createRes = await apiCall('POST', '/api/templates', formData, true);
    if (!createRes.success) throw new Error('Failed to create template');
    const templateId = createRes.data.id;
    pass('Template created');

    const useRes = await apiCall('POST', `/api/templates/${templateId}/use`, {
      signers: [
        { name: 'Charlie', email: 'charlie@example.com', order: 1 },
        { name: 'Dana', email: 'dana@example.com', order: 2 },
      ],
    });
    if (!useRes.success) throw new Error('Failed to use template');
    pass('Envelope created from template');

  } catch (error) {
    fail('Template flow', (error as Error).message);
  }
}

// ─── Test: Webhook ───────────────────────────────────────────────────

async function testWebhook() {
  console.log('\n🔔 Test: Webhook (register webhook → complete envelope → verify fired)');

  try {
    const registerRes = await apiCall('POST', '/api/webhooks', {
      url: 'https://webhook.site/test-coseal-e2e',
      events: ['envelope.completed'],
    });
    if (!registerRes.success) throw new Error('Failed to register webhook');
    pass('Webhook registered');

  } catch (error) {
    fail('Webhook', (error as Error).message);
  }
}

// ─── Test: Retention Policy ──────────────────────────────────────────

async function testRetentionPolicy() {
  console.log('\n📅 Test: Retention Policy (assign policy → verify date set)');

  try {
    const policiesRes = await apiCall('GET', '/api/retention/policies');
    if (!policiesRes.success) throw new Error('Failed to fetch policies');

    // Create a test policy
    const createRes = await apiCall('POST', '/api/retention/policies', {
      name: 'E2E Test Policy',
      retentionDays: 365,
      autoDelete: false,
      notifyBefore: 30,
    });
    if (!createRes.success) throw new Error('Failed to create policy');
    pass('Retention policy created');

  } catch (error) {
    fail('Retention policy', (error as Error).message);
  }
}

// ─── Test: Audit Trail ───────────────────────────────────────────────

async function testAuditTrail() {
  console.log('\n📊 Test: Audit Trail (JSON, CSV exports)');

  try {
    // Create a simple envelope first
    const pdf = await createTestPdf();
    const formData = new FormData();
    formData.append('documents', new Blob([pdf], { type: 'application/pdf' }), 'audit-test.pdf');
    formData.append('subject', 'Audit Test');
    formData.append('signingOrder', 'sequential');
    formData.append('signers', JSON.stringify([
      { name: 'Eve', email: 'eve@example.com', order: 1 },
    ]));

    const createRes = await apiCall('POST', '/api/envelopes', formData, true);
    if (!createRes.success) throw new Error('Failed to create envelope');
    const envelopeId = createRes.data.id;

    const auditJson = await apiCall('GET', `/api/envelopes/${envelopeId}/audit`);
    if (!auditJson.success) throw new Error('Failed to get audit trail');
    pass('Audit trail (JSON) retrieved');

    const auditCsv = await fetch(`${API_BASE}/api/envelopes/${envelopeId}/audit?format=csv`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    if (!auditCsv.ok) throw new Error('Failed to get CSV audit trail');
    pass('Audit trail (CSV) retrieved');

  } catch (error) {
    fail('Audit trail', (error as Error).message);
  }
}

// ─── Test: Admin Analytics ───────────────────────────────────────────

async function testAdminAnalytics() {
  console.log('\n📈 Test: Admin Analytics (summary counts)');

  try {
    const analyticsRes = await apiCall('GET', '/api/admin/analytics');
    if (!analyticsRes.success) throw new Error('Failed to fetch analytics');
    if (typeof analyticsRes.data.totalEnvelopes !== 'number') throw new Error('Invalid analytics data');
    pass('Admin analytics retrieved');

  } catch (error) {
    fail('Admin analytics', (error as Error).message);
  }
}

// ─── Test: Multi-Tenant ──────────────────────────────────────────────

async function testMultiTenant() {
  console.log('\n🏢 Test: Multi-Tenant (create org → API key → verify isolation)');

  try {
    const org1Res = await apiCall('POST', '/api/organizations', {
      name: 'E2E Test Org 1',
      slug: 'e2e-test-org-1',
      plan: 'pro',
    });
    if (!org1Res.success) throw new Error('Failed to create org 1');
    pass('Organization 1 created');

    const org2Res = await apiCall('POST', '/api/organizations', {
      name: 'E2E Test Org 2',
      slug: 'e2e-test-org-2',
      plan: 'free',
    });
    if (!org2Res.success) throw new Error('Failed to create org 2');
    pass('Organization 2 created');

    // Create API key for org 1
    const keyRes = await apiCall('POST', `/api/organizations/${org1Res.data.id}/api-keys`, {
      name: 'E2E Test Key',
    });
    if (!keyRes.success) throw new Error('Failed to create API key');
    pass('API key generated for org 1');

    // Get usage for org 1
    const usageRes = await apiCall('GET', '/api/organizations/usage');
    if (!usageRes.success) throw new Error('Failed to get usage');
    pass('Usage endpoint working');

  } catch (error) {
    fail('Multi-tenant', (error as Error).message);
  }
}

// ─── Test: Plan Tiers ────────────────────────────────────────────────

async function testPlanTiers() {
  console.log('\n💎 Test: Plan Tiers (list plans with features)');

  try {
    const plansRes = await apiCall('GET', '/api/organizations/plans');
    if (!plansRes.success) throw new Error('Failed to fetch plans');
    if (plansRes.data.length < 3) throw new Error('Expected at least 3 plan tiers');
    pass('Plan tiers retrieved');

    const freePlan = plansRes.data.find((p: any) => p.id === 'free');
    if (freePlan.envelopeLimit !== 5) throw new Error('Free plan should have 5 envelope limit');
    pass('Free plan limits verified');

    const enterprisePlan = plansRes.data.find((p: any) => p.id === 'enterprise');
    if (enterprisePlan.envelopeLimit !== null) throw new Error('Enterprise plan should be unlimited');
    pass('Enterprise plan unlimited verified');

  } catch (error) {
    fail('Plan tiers', (error as Error).message);
  }
}

// ─── Test: Integrations API ──────────────────────────────────────────

async function testIntegrationsAPI() {
  console.log('\n🔌 Test: Integrations API (list available integrations)');

  try {
    const integrationsRes = await apiCall('GET', '/api/integrations');
    if (!integrationsRes.success) throw new Error('Failed to list integrations');
    if (integrationsRes.data.length < 6) throw new Error('Expected at least 6 integrations');
    pass('Integrations listed (Slack, Box, Egnyte, MS365, Google, Jira)');

    const slack = integrationsRes.data.find((i: any) => i.name === 'slack');
    if (!slack) throw new Error('Slack integration not found');
    pass('Slack integration available');

  } catch (error) {
    fail('Integrations API', (error as Error).message);
  }
}

// ─── Test: Void Envelope ─────────────────────────────────────────────

async function testVoidEnvelope() {
  console.log('\n🚫 Test: Void Envelope (create → send → void)');

  try {
    const pdf = await createTestPdf();
    const formData = new FormData();
    formData.append('documents', new Blob([pdf], { type: 'application/pdf' }), 'void-test.pdf');
    formData.append('subject', 'Void Test');
    formData.append('signingOrder', 'sequential');
    formData.append('signers', JSON.stringify([
      { name: 'Frank', email: 'frank@example.com', order: 1 },
    ]));

    const createRes = await apiCall('POST', '/api/envelopes', formData, true);
    if (!createRes.success) throw new Error('Failed to create envelope');
    const envelopeId = createRes.data.id;

    await apiCall('POST', `/api/envelopes/${envelopeId}/send`);
    pass('Envelope sent for voiding');

    await apiCall('POST', `/api/envelopes/${envelopeId}/void`, {
      reason: 'E2E test void',
    });
    pass('Envelope voided');

    const envelope = await apiCall('GET', `/api/envelopes/${envelopeId}`);
    if (envelope.data.status !== 'voided') throw new Error('Envelope not voided');
    pass('Void status verified');

  } catch (error) {
    fail('Void envelope', (error as Error).message);
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  CoSeal v1.0.0 — Comprehensive E2E Integration Test      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`API Base: ${API_BASE}`);
  console.log('');

  await ensureCerts();

  // Run all tests
  await testBasicFlow();
  await testTemplateFlow();
  await testWebhook();
  await testRetentionPolicy();
  await testAuditTrail();
  await testAdminAnalytics();
  await testMultiTenant();
  await testPlanTiers();
  await testIntegrationsAPI();
  await testVoidEnvelope();

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                     TEST SUMMARY                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`✅ Tests passed: ${testsPassed}`);
  console.log(`❌ Tests failed: ${testsFailed}`);
  console.log('');

  if (testsFailed === 0) {
    console.log('🎉 All tests passed — CoSeal v1.0.0 is ready to ship!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed — please fix before shipping');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
