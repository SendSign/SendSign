import { getEventsForEnvelope } from './auditLogger.js';
import { formatEventType, getEventDescription } from './eventTypes.js';

/**
 * Export the audit trail for an envelope as formatted JSON.
 */
export async function exportAsJSON(envelopeId: string): Promise<string> {
  const events = await getEventsForEnvelope(envelopeId);

  const formatted = {
    envelopeId,
    exportedAt: new Date().toISOString(),
    eventCount: events.length,
    events: events.map((event) => ({
      id: event.id,
      timestamp: event.createdAt.toISOString(),
      eventType: event.eventType,
      eventDescription: getEventDescription(event.eventType),
      signerId: event.signerId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      eventData: event.eventData,
    })),
  };

  return JSON.stringify(formatted, null, 2);
}

/**
 * Export the audit trail for an envelope as CSV.
 */
export async function exportAsCSV(envelopeId: string): Promise<string> {
  const events = await getEventsForEnvelope(envelopeId);

  // CSV header
  const headers = [
    'Event ID',
    'Timestamp',
    'Event Type',
    'Description',
    'Signer ID',
    'IP Address',
    'User Agent',
    'Additional Data',
  ];

  // CSV rows
  const rows = events.map((event) => [
    event.id,
    event.createdAt.toISOString(),
    event.eventType,
    getEventDescription(event.eventType),
    event.signerId || '',
    event.ipAddress || '',
    event.userAgent || '',
    event.eventData ? JSON.stringify(event.eventData) : '',
  ]);

  // Escape CSV fields that contain commas or quotes
  const escapeCsvField = (field: string): string => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  const csvLines = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => row.map(escapeCsvField).join(',')),
  ];

  return csvLines.join('\n');
}

/**
 * Export the audit trail as a PDF certificate.
 * This will be implemented in a later step after the crypto module is ready.
 */
export async function exportAsPDF(envelopeId: string): Promise<Buffer> {
  // Stub for now — will be implemented in Step 6 (Crypto module)
  throw new Error(
    `Not implemented: exportAsPDF for envelope ${envelopeId}. This will be implemented after the crypto module is ready.`,
  );
}

/**
 * Format the audit trail for human-readable display (text format).
 */
export async function formatAuditTrailForDisplay(envelopeId: string): Promise<string> {
  const events = await getEventsForEnvelope(envelopeId);

  const lines = [
    '╔════════════════════════════════════════════════════════════════╗',
    '║               AUDIT TRAIL — ENVELOPE TIMELINE                 ║',
    '╚════════════════════════════════════════════════════════════════╝',
    '',
    `Envelope ID: ${envelopeId}`,
    `Total Events: ${events.length}`,
    `Exported: ${new Date().toLocaleString()}`,
    '',
    '────────────────────────────────────────────────────────────────',
    '',
  ];

  for (const event of events) {
    const timestamp = event.createdAt.toLocaleString();
    const eventType = formatEventType(event.eventType);
    const description = getEventDescription(event.eventType);

    lines.push(`[${timestamp}] ${eventType}`);
    lines.push(`  ${description}`);

    if (event.signerId) {
      lines.push(`  Signer: ${event.signerId}`);
    }

    if (event.ipAddress) {
      lines.push(`  IP: ${event.ipAddress}`);
    }

    if (event.eventData && Object.keys(event.eventData).length > 0) {
      lines.push(`  Data: ${JSON.stringify(event.eventData)}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
