export type EventType =
  | 'created'
  | 'sent'
  | 'opened'
  | 'viewed'
  | 'field_filled'
  | 'signed'
  | 'declined'
  | 'voided'
  | 'expired'
  | 'reminded'
  | 'sealed'
  | 'downloaded'
  | 'accessed'
  | 'corrected';

export interface AuditEvent {
  id: string;
  envelopeId: string;
  signerId?: string;
  eventType: EventType;
  eventData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface CreateAuditEvent {
  envelopeId: string;
  signerId?: string;
  eventType: EventType;
  eventData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

const VALID_EVENT_TYPES: Set<string> = new Set([
  'created',
  'sent',
  'opened',
  'viewed',
  'field_filled',
  'signed',
  'declined',
  'voided',
  'expired',
  'reminded',
  'sealed',
  'downloaded',
  'accessed',
  'corrected',
]);

/**
 * Type guard to check if a string is a valid event type.
 */
export function isValidEventType(type: string): type is EventType {
  return VALID_EVENT_TYPES.has(type);
}

/**
 * Format an event type for human-readable display.
 * Example: 'field_filled' -> 'Field Filled'
 */
export function formatEventType(type: EventType): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get a description for each event type.
 */
export function getEventDescription(type: EventType): string {
  const descriptions: Record<EventType, string> = {
    created: 'Envelope was created',
    sent: 'Envelope was sent to signers',
    opened: 'Signer opened the signing link',
    viewed: 'Signer viewed the document',
    field_filled: 'Signer filled a field',
    signed: 'Signer completed signing',
    declined: 'Signer declined to sign',
    voided: 'Envelope was voided by sender',
    expired: 'Envelope expired without completion',
    reminded: 'Reminder sent to signer',
    sealed: 'Document was cryptographically sealed',
    downloaded: 'Sealed document was downloaded',
    accessed: 'Document was accessed',
    corrected: 'Envelope was corrected after sending',
  };
  return descriptions[type];
}
