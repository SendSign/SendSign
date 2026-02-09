import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { auditEvents } from '../db/schema.js';
import type { AuditEvent, CreateAuditEvent } from './eventTypes.js';

/**
 * Log an audit event to the database.
 * This function never throws — if logging fails, it logs to stderr and returns a fallback event.
 */
export async function logEvent(event: CreateAuditEvent): Promise<AuditEvent> {
  try {
    const db = getDb();

    const [inserted] = await db
      .insert(auditEvents)
      .values({
        envelopeId: event.envelopeId,
        signerId: event.signerId,
        eventType: event.eventType,
        eventData: event.eventData,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      })
      .returning();

    return {
      id: inserted.id,
      envelopeId: inserted.envelopeId,
      signerId: inserted.signerId ?? undefined,
      eventType: inserted.eventType as any,
      eventData: (inserted.eventData as Record<string, unknown>) ?? undefined,
      ipAddress: inserted.ipAddress ?? undefined,
      userAgent: inserted.userAgent ?? undefined,
      createdAt: inserted.createdAt,
    };
  } catch (error) {
    console.error('Failed to log audit event:', error);
    console.error('Event details:', event);

    // Return a fallback event so the caller doesn't crash
    return {
      id: 'failed-' + Date.now(),
      ...event,
      createdAt: new Date(),
    };
  }
}

/**
 * Get all audit events for a specific envelope, ordered chronologically.
 */
export async function getEventsForEnvelope(envelopeId: string): Promise<AuditEvent[]> {
  try {
    const db = getDb();

    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.envelopeId, envelopeId))
      .orderBy(auditEvents.createdAt);

    return events.map((event) => ({
      id: event.id,
      envelopeId: event.envelopeId,
      signerId: event.signerId ?? undefined,
      eventType: event.eventType as any,
      eventData: (event.eventData as Record<string, unknown>) ?? undefined,
      ipAddress: event.ipAddress ?? undefined,
      userAgent: event.userAgent ?? undefined,
      createdAt: event.createdAt,
    }));
  } catch (error) {
    console.error('Failed to get events for envelope:', envelopeId, error);
    return [];
  }
}

/**
 * Get all audit events for a specific signer, ordered chronologically.
 */
export async function getEventsForSigner(signerId: string): Promise<AuditEvent[]> {
  try {
    const db = getDb();

    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.signerId, signerId))
      .orderBy(auditEvents.createdAt);

    return events.map((event) => ({
      id: event.id,
      envelopeId: event.envelopeId,
      signerId: event.signerId ?? undefined,
      eventType: event.eventType as any,
      eventData: (event.eventData as Record<string, unknown>) ?? undefined,
      ipAddress: event.ipAddress ?? undefined,
      userAgent: event.userAgent ?? undefined,
      createdAt: event.createdAt,
    }));
  } catch (error) {
    console.error('Failed to get events for signer:', signerId, error);
    return [];
  }
}

/**
 * Get the most recent audit events across all envelopes.
 */
export async function getRecentEvents(limit: number = 50): Promise<AuditEvent[]> {
  try {
    const db = getDb();

    const events = await db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);

    return events.map((event) => ({
      id: event.id,
      envelopeId: event.envelopeId,
      signerId: event.signerId ?? undefined,
      eventType: event.eventType as any,
      eventData: (event.eventData as Record<string, unknown>) ?? undefined,
      ipAddress: event.ipAddress ?? undefined,
      userAgent: event.userAgent ?? undefined,
      createdAt: event.createdAt,
    }));
  } catch (error) {
    console.error('Failed to get recent events:', error);
    return [];
  }
}

/**
 * Get a count of audit events by type for an envelope.
 */
export async function getEventCountsByType(
  envelopeId: string,
): Promise<Record<string, number>> {
  try {
    const events = await getEventsForEnvelope(envelopeId);
    const counts: Record<string, number> = {};

    for (const event of events) {
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    }

    return counts;
  } catch (error) {
    console.error('Failed to get event counts:', envelopeId, error);
    return {};
  }
}
