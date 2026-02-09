import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { getDb } from '../../db/connection.js';
import { envelopes, signers, documents, auditEvents, fields } from '../../db/schema.js';
import { sql } from 'drizzle-orm';

const API_KEY = process.env.API_KEY ?? process.env.COSEAL_API_KEY ?? 'test-api-key';

describe('Envelope API (integration)', () => {
  const db = getDb();

  beforeAll(() => {
    // Ensure API_KEY is set for tests
    if (!process.env.API_KEY && !process.env.COSEAL_API_KEY) {
      process.env.API_KEY = API_KEY;
    }
  });

  beforeEach(async () => {
    // Clean up database
    await db.execute(
      sql`TRUNCATE TABLE audit_events, fields, signers, documents, envelopes RESTART IDENTITY CASCADE`,
    );
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('POST /api/envelopes creates an envelope', async () => {
    const res = await request(app)
      .post('/api/envelopes')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({
        subject: 'Test NDA',
        message: 'Please sign',
        signers: [
          { name: 'Alice', email: 'alice@test.com', order: 1 },
          { name: 'Bob', email: 'bob@test.com', order: 2 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.subject).toBe('Test NDA');
    expect(res.body.data.signers).toHaveLength(2);
  });

  it('POST /api/envelopes requires auth', async () => {
    const res = await request(app)
      .post('/api/envelopes')
      .send({
        subject: 'Test',
        signers: [{ name: 'Alice', email: 'alice@test.com' }],
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/envelopes/:id retrieves an envelope', async () => {
    // Create envelope first
    const createRes = await request(app)
      .post('/api/envelopes')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({
        subject: 'Retrieve Test',
        signers: [{ name: 'Charlie', email: 'charlie@test.com' }],
      });

    const envelopeId = createRes.body.data.id;

    // Retrieve it
    const getRes = await request(app)
      .get(`/api/envelopes/${envelopeId}`)
      .set('Authorization', `Bearer ${API_KEY}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.data.id).toBe(envelopeId);
  });

  it('POST /api/envelopes/:id/send sends an envelope', async () => {
    // Create envelope
    const createRes = await request(app)
      .post('/api/envelopes')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({
        subject: 'Send Test',
        signers: [{ name: 'Dave', email: 'dave@test.com' }],
      });

    const envelopeId = createRes.body.data.id;

    // Send it
    const sendRes = await request(app)
      .post(`/api/envelopes/${envelopeId}/send`)
      .set('Authorization', `Bearer ${API_KEY}`);

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.data.status).toBe('sent');
    expect(sendRes.body.data.sentAt).toBeTruthy();
  });

  it('POST /api/envelopes/:id/void voids an envelope', async () => {
    const createRes = await request(app)
      .post('/api/envelopes')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({
        subject: 'Void Test',
        signers: [{ name: 'Eve', email: 'eve@test.com' }],
      });

    const envelopeId = createRes.body.data.id;

    await request(app)
      .post(`/api/envelopes/${envelopeId}/send`)
      .set('Authorization', `Bearer ${API_KEY}`);

    const voidRes = await request(app)
      .post(`/api/envelopes/${envelopeId}/void`)
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({ reason: 'Testing void' });

    expect(voidRes.status).toBe(200);
    expect(voidRes.body.data.status).toBe('voided');
  });

  it('GET /api/envelopes lists envelopes', async () => {
    // Create a few envelopes
    await request(app)
      .post('/api/envelopes')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({ subject: 'List Test 1', signers: [{ name: 'A', email: 'a@test.com' }] });

    await request(app)
      .post('/api/envelopes')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({ subject: 'List Test 2', signers: [{ name: 'B', email: 'b@test.com' }] });

    const res = await request(app)
      .get('/api/envelopes')
      .set('Authorization', `Bearer ${API_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.envelopes.length).toBeGreaterThanOrEqual(2);
  });
});
