import { describe, it, expect } from 'vitest';
import { isValidEventType, formatEventType, getEventDescription } from './eventTypes.js';

describe('Event Types', () => {
  describe('isValidEventType', () => {
    it('should return true for valid event types', () => {
      expect(isValidEventType('created')).toBe(true);
      expect(isValidEventType('sent')).toBe(true);
      expect(isValidEventType('signed')).toBe(true);
      expect(isValidEventType('sealed')).toBe(true);
      expect(isValidEventType('field_filled')).toBe(true);
    });

    it('should return false for invalid event types', () => {
      expect(isValidEventType('invalid')).toBe(false);
      expect(isValidEventType('CREATED')).toBe(false);
      expect(isValidEventType('')).toBe(false);
      expect(isValidEventType('random_event')).toBe(false);
    });
  });

  describe('formatEventType', () => {
    it('should format event types for display', () => {
      expect(formatEventType('created')).toBe('Created');
      expect(formatEventType('sent')).toBe('Sent');
      expect(formatEventType('field_filled')).toBe('Field Filled');
      expect(formatEventType('signed')).toBe('Signed');
    });

    it('should handle single-word event types', () => {
      expect(formatEventType('opened')).toBe('Opened');
      expect(formatEventType('viewed')).toBe('Viewed');
      expect(formatEventType('sealed')).toBe('Sealed');
    });
  });

  describe('getEventDescription', () => {
    it('should return descriptions for all event types', () => {
      expect(getEventDescription('created')).toBe('Envelope was created');
      expect(getEventDescription('sent')).toBe('Envelope was sent to signers');
      expect(getEventDescription('opened')).toBe('Signer opened the signing link');
      expect(getEventDescription('signed')).toBe('Signer completed signing');
      expect(getEventDescription('sealed')).toBe('Document was cryptographically sealed');
    });

    it('should provide unique descriptions', () => {
      const descriptions = [
        'created',
        'sent',
        'opened',
        'viewed',
        'signed',
        'declined',
        'voided',
        'expired',
        'sealed',
      ].map((type) => getEventDescription(type as any));

      const uniqueDescriptions = new Set(descriptions);
      expect(uniqueDescriptions.size).toBe(descriptions.length);
    });
  });
});
