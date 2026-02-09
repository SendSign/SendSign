import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'drizzle-orm';
import { logEvent, getEventsForEnvelope, getEventsForSigner } from './auditLogger.js';
import { getDb, closeDb } from '../db/connection.js';
import { auditEvents, envelopes, signers, documents, fields } from '../db/schema.js';
import type { CreateAuditEvent } from './eventTypes.js';

describe('Audit Logger', () => {
  const db = getDb();

  // Generate fresh IDs for each test run
  let testEnvelopeId: string;
  let testEnvelopeId2: string;
  let testSignerId: string;
  let testDocumentId: string;

  beforeEach(async () => {
    // Generate new IDs for each test
    testEnvelopeId = uuidv4();
    testEnvelopeId2 = uuidv4();
    testSignerId = uuidv4();
    testDocumentId = uuidv4();

    // Clean up ALL test data (order matters due to foreign key constraints)
    // Note: We're cleaning the whole database to avoid foreign key issues
    await db.execute(sql`TRUNCATE TABLE audit_events, fields, signers, documents, envelopes RESTART IDENTITY CASCADE`);

    // Create test envelope and signer
    await db.insert(envelopes).values({
      id: testEnvelopeId,
      subject: 'Test Audit Envelope',
      status: 'draft',
      createdBy: 'test',
    });

    await db.insert(envelopes).values({
      id: testEnvelopeId2,
      subject: 'Test Audit Envelope 2',
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

    await db.insert(signers).values({
      id: testSignerId,
      envelopeId: testEnvelopeId,
      name: 'Test Signer',
      email: 'test@example.com',
    });
  });

  describe('logEvent', () => {
    it('should create an audit event', async () => {
      const event: CreateAuditEvent = {
        envelopeId: testEnvelopeId,
        eventType: 'created',
        eventData: { test: 'data' },
      };

      const result = await logEvent(event);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.envelopeId).toBe(testEnvelopeId);
      expect(result.eventType).toBe('created');
      expect(result.eventData).toEqual({ test: 'data' });
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should create an event with signer information', async () => {
      const event: CreateAuditEvent = {
        envelopeId: testEnvelopeId,
        signerId: testSignerId,
        eventType: 'signed',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const result = await logEvent(event);

      expect(result.signerId).toBe(testSignerId);
      expect(result.ipAddress).toBe('192.168.1.1');
      expect(result.userAgent).toBe('Mozilla/5.0');
    });

    it('should never throw even if database fails', async () => {
      // Use an invalid envelope ID that doesn't exist
      const event: CreateAuditEvent = {
        envelopeId: 'nonexistent-envelope-id',
        eventType: 'created',
      };

      // This should not throw, but return a fallback event
      const result = await logEvent(event);

      expect(result).toBeDefined();
      expect(result.envelopeId).toBe('nonexistent-envelope-id');
    });
  });

  describe('getEventsForEnvelope', () => {
    it('should retrieve all events for an envelope', async () => {
      // Create multiple events and verify each one succeeded
      const event1 = await logEvent({
        envelopeId: testEnvelopeId,
        eventType: 'created',
      });
      expect(event1.id).toBeDefined();
      expect(event1.id).not.toContain('failed');

      const event2 = await logEvent({ envelopeId: testEnvelopeId, eventType: 'sent' });
      expect(event2.id).not.toContain('failed');

      const event3 = await logEvent({ envelopeId: testEnvelopeId, eventType: 'opened' });
      expect(event3.id).not.toContain('failed');

      const events = await getEventsForEnvelope(testEnvelopeId);

      expect(events).toHaveLength(3);
      expect(events[0].eventType).toBe('created');
      expect(events[1].eventType).toBe('sent');
      expect(events[2].eventType).toBe('opened');
    });

    it('should return events ordered chronologically', async () => {
      // Create events with a slight delay
      const event1 = await logEvent({
        envelopeId: testEnvelopeId,
        eventType: 'created',
      });
      expect(event1.id).not.toContain('failed');

      await new Promise((resolve) => setTimeout(resolve, 10));

      const event2 = await logEvent({ envelopeId: testEnvelopeId, eventType: 'sent' });
      expect(event2.id).not.toContain('failed');

      await new Promise((resolve) => setTimeout(resolve, 10));

      const event3 = await logEvent({ envelopeId: testEnvelopeId, eventType: 'viewed' });
      expect(event3.id).not.toContain('failed');

      const events = await getEventsForEnvelope(testEnvelopeId);

      expect(events).toHaveLength(3);
      // Verify chronological order
      expect(events[0].createdAt.getTime()).toBeLessThan(events[1].createdAt.getTime());
      expect(events[1].createdAt.getTime()).toBeLessThan(events[2].createdAt.getTime());
    });

    it('should only return events for the specified envelope', async () => {
      // Create events for different envelopes
      await logEvent({ envelopeId: testEnvelopeId, eventType: 'created' });
      await logEvent({ envelopeId: testEnvelopeId2, eventType: 'created' });
      await logEvent({ envelopeId: testEnvelopeId, eventType: 'sent' });

      const events = await getEventsForEnvelope(testEnvelopeId);

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.envelopeId === testEnvelopeId)).toBe(true);
    });

    it('should return empty array for envelope with no events', async () => {
      const events = await getEventsForEnvelope(testEnvelopeId2);

      expect(events).toEqual([]);
    });
  });

  describe('getEventsForSigner', () => {
    it('should retrieve all events for a signer', async () => {
      await logEvent({
        envelopeId: testEnvelopeId,
        signerId: testSignerId,
        eventType: 'opened',
      });
      await logEvent({
        envelopeId: testEnvelopeId,
        signerId: testSignerId,
        eventType: 'signed',
      });

      const events = await getEventsForSigner(testSignerId);

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('opened');
      expect(events[1].eventType).toBe('signed');
      expect(events.every((e) => e.signerId === testSignerId)).toBe(true);
    });

    it('should return empty array for signer with no events', async () => {
      const events = await getEventsForSigner('nonexistent-signer');

      expect(events).toEqual([]);
    });
  });

  describe('event data integrity', () => {
    it('should preserve complex event data', async () => {
      const complexData = {
        field: 'signature',
        previousValue: null,
        newValue: 'John Doe',
        metadata: {
          timestamp: Date.now(),
          nested: {
            deep: 'value',
          },
        },
      };

      const event = await logEvent({
        envelopeId: testEnvelopeId,
        eventType: 'field_filled',
        eventData: complexData,
      });

      expect(event.eventData).toEqual(complexData);

      // Verify it's also preserved when retrieving
      const events = await getEventsForEnvelope(testEnvelopeId);
      expect(events[0].eventData).toEqual(complexData);
    });
  });
});
