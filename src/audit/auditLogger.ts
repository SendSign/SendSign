import crypto from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { auditEvents } from '../db/schema.js';
import type { AuditEvent, CreateAuditEvent } from './eventTypes.js';

/**
 * Compute a SHA-256 hash of the event data for the tamper-proof chain.
 */
function computeEventHash(event: {
  envelopeId: string;
  signerId?: string;
  eventType: string;
  eventData?: Record<string, unknown>;
  ipAddress?: string;
  previousHash?: string;
}): string {
  const payload = JSON.stringify({
    envelopeId: event.envelopeId,
    signerId: event.signerId || null,
    eventType: event.eventType,
    eventData: event.eventData || {},
    ipAddress: event.ipAddress || null,
    previousHash: event.previousHash || null,
    timestamp: Date.now(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Resolve IP to approximate geolocation (country/region).
 * Uses geoip-lite for offline lookup — no external API calls.
 */
async function resolveGeolocation(ip: string | undefined): Promise<string | null> {
  if (!ip) return null;
  try {
    // Dynamically import geoip-lite (it has a large dataset loaded at import)
    const geoip = await import('geoip-lite');
    // Strip IPv6 prefix if present
    const cleanIp = ip.replace(/^::ffff:/, '');
    const geo = geoip.default.lookup(cleanIp);
    if (geo) {
      return `${geo.city || 'Unknown'}, ${geo.region || ''}, ${geo.country}`.replace(/, ,/g, ',').replace(/^, /, '');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Log an audit event to the database with hash chain and geolocation.
 * This function never throws — if logging fails, it logs to stderr and returns a fallback event.
 */
export async function logEvent(event: CreateAuditEvent): Promise<AuditEvent> {
  try {
    const db = getDb();

    // Get the hash of the most recent event for this envelope (hash chain)
    let previousHash: string | null = null;
    try {
      const [lastEvent] = await db
        .select({ eventHash: auditEvents.eventHash })
        .from(auditEvents)
        .where(eq(auditEvents.envelopeId, event.envelopeId))
        .orderBy(desc(auditEvents.createdAt))
        .limit(1);
      previousHash = lastEvent?.eventHash ?? null;
    } catch {
      // Non-critical — proceed without chain
    }

    // Compute the hash for this event
    const eventHash = computeEventHash({
      ...event,
      previousHash: previousHash ?? undefined,
    });

    // Resolve geolocation from IP
    const geolocation = await resolveGeolocation(event.ipAddress);

    const [inserted] = await db
      .insert(auditEvents)
      .values({
        envelopeId: event.envelopeId,
        signerId: event.signerId,
        eventType: event.eventType,
        eventData: event.eventData,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        geolocation,
        eventHash,
        previousHash,
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
