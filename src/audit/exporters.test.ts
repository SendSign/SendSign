import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'drizzle-orm';
import { exportAsJSON, exportAsCSV, formatAuditTrailForDisplay } from './exporters.js';
import { logEvent } from './auditLogger.js';
import { getDb } from '../db/connection.js';
import { auditEvents, envelopes, documents, signers, fields } from '../db/schema.js';

describe('Audit Exporters', () => {
  const db = getDb();
  let testEnvelopeId: string;
  let testDocumentId: string;

  beforeEach(async () => {
    // Generate new IDs for each test
    testEnvelopeId = uuidv4();
    testDocumentId = uuidv4();

    // Clean up ALL test data
    await db.execute(sql`TRUNCATE TABLE audit_events, fields, signers, documents, envelopes RESTART IDENTITY CASCADE`);

    // Create test envelope
    await db.insert(envelopes).values({
      id: testEnvelopeId,
      subject: 'Export Test Envelope',
      status: 'draft',
      createdBy: 'test',
    });

    await db.insert(documents).values({
      id: testDocumentId,
      envelopeId: testEnvelopeId,
      filename: 'test.pdf',
      storagePath: 'test/test.pdf',
      documentHash: 'testhash123',
    });

    // Create some test events (verify they succeed)
    const event1 = await logEvent({
      envelopeId: testEnvelopeId,
      eventType: 'created',
      eventData: { subject: 'Export Test Envelope' },
    });
    if (event1.id.includes('failed')) {
      throw new Error('Failed to create test event 1');
    }

    const event2 = await logEvent({
      envelopeId: testEnvelopeId,
      eventType: 'sent',
      eventData: { signerCount: 2 },
    });
    if (event2.id.includes('failed')) {
      throw new Error('Failed to create test event 2');
    }

    const event3 = await logEvent({
      envelopeId: testEnvelopeId,
      eventType: 'opened',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });
    if (event3.id.includes('failed')) {
      throw new Error('Failed to create test event 3');
    }
  });

  describe('exportAsJSON', () => {
    it('should export audit trail as JSON', async () => {
      const json = await exportAsJSON(testEnvelopeId);

      expect(json).toBeDefined();
      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json);
      expect(parsed.envelopeId).toBe(testEnvelopeId);
      expect(parsed.eventCount).toBe(3);
      expect(parsed.events).toHaveLength(3);
      expect(parsed.exportedAt).toBeDefined();
    });

    it('should include all event details in JSON', async () => {
      const json = await exportAsJSON(testEnvelopeId);
      const parsed = JSON.parse(json);

      const firstEvent = parsed.events[0];
      expect(firstEvent.eventType).toBe('created');
      expect(firstEvent.eventDescription).toBe('Envelope was created');
      expect(firstEvent.timestamp).toBeDefined();
      expect(firstEvent.eventData).toEqual({ subject: 'Export Test Envelope' });
    });

    it('should be valid JSON', async () => {
      const json = await exportAsJSON(testEnvelopeId);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('exportAsCSV', () => {
    it('should export audit trail as CSV', async () => {
      const csv = await exportAsCSV(testEnvelopeId);

      expect(csv).toBeDefined();
      expect(typeof csv).toBe('string');

      const lines = csv.split('\n');
      expect(lines.length).toBeGreaterThan(0);

      // Check header
      expect(lines[0]).toContain('Event ID');
      expect(lines[0]).toContain('Timestamp');
      expect(lines[0]).toContain('Event Type');
    });

    it('should have correct number of rows', async () => {
      const csv = await exportAsCSV(testEnvelopeId);
      const lines = csv.split('\n');

      // 1 header + 3 events = 4 lines
      expect(lines.length).toBe(4);
    });

    it('should escape CSV fields properly', async () => {
      // Create an event with special characters
      await logEvent({
        envelopeId: testEnvelopeId,
        eventType: 'field_filled',
        eventData: { field: 'text', value: 'Contains, comma and "quotes"' },
      });

      const csv = await exportAsCSV(testEnvelopeId);

      // Should not break CSV parsing
      expect(csv).toBeDefined();

      // Special characters should be escaped
      expect(csv).toContain('""');
    });

    it('should handle events with no optional fields', async () => {
      const csv = await exportAsCSV(testEnvelopeId);
      const lines = csv.split('\n');

      // Should still have valid rows
      expect(lines.length).toBeGreaterThan(1);
    });
  });

  describe('formatAuditTrailForDisplay', () => {
    it('should format audit trail as readable text', async () => {
      const text = await formatAuditTrailForDisplay(testEnvelopeId);

      expect(text).toBeDefined();
      expect(typeof text).toBe('string');

      // Check for key sections
      expect(text).toContain('AUDIT TRAIL');
      expect(text).toContain(testEnvelopeId);
      expect(text).toContain('Created');
      expect(text).toContain('Sent');
      expect(text).toContain('Opened');
    });

    it('should include event details', async () => {
      const text = await formatAuditTrailForDisplay(testEnvelopeId);

      // Should show IP address
      expect(text).toContain('192.168.1.1');

      // Should show event descriptions
      expect(text).toContain('Envelope was created');
      expect(text).toContain('Envelope was sent to signers');
    });

    it('should handle empty audit trail', async () => {
      const emptyEnvelopeId = uuidv4();

      await db.insert(envelopes).values({
        id: emptyEnvelopeId,
        subject: 'Empty',
        status: 'draft',
        createdBy: 'test',
      });

      const text = await formatAuditTrailForDisplay(emptyEnvelopeId);

      expect(text).toBeDefined();
      expect(text).toContain('Total Events: 0');
    });
  });
});
