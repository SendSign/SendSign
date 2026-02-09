import { describe, it, expect } from 'vitest';
import { validateFieldValue, maskSSN } from './fieldValidation.js';

describe('validateFieldValue', () => {
  describe('type-based validation', () => {
    it('validates number fields', () => {
      expect(validateFieldValue('123', 'number', []).valid).toBe(true);
      expect(validateFieldValue('abc', 'number', []).valid).toBe(false);
      expect(validateFieldValue('', 'number', []).valid).toBe(true);
    });

    it('validates checkbox fields', () => {
      expect(validateFieldValue('true', 'checkbox', []).valid).toBe(true);
      expect(validateFieldValue('false', 'checkbox', []).valid).toBe(true);
      expect(validateFieldValue('maybe', 'checkbox', []).valid).toBe(false);
    });

    it('validates date fields', () => {
      expect(validateFieldValue('2024-01-15', 'date', []).valid).toBe(true);
      expect(validateFieldValue('not-a-date', 'date', []).valid).toBe(false);
    });
  });

  describe('email validation', () => {
    it('accepts valid emails', () => {
      const result = validateFieldValue('test@example.com', 'text', [{ type: 'email' }]);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid emails', () => {
      const result = validateFieldValue('not-an-email', 'text', [{ type: 'email' }]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('email');
    });

    it('allows empty email (not required)', () => {
      const result = validateFieldValue('', 'text', [{ type: 'email' }]);
      expect(result.valid).toBe(true);
    });
  });

  describe('phone validation', () => {
    it('accepts E.164 format', () => {
      expect(validateFieldValue('+12125551234', 'text', [{ type: 'phone' }]).valid).toBe(true);
      expect(validateFieldValue('+442071234567', 'text', [{ type: 'phone' }]).valid).toBe(true);
    });

    it('rejects non-E.164 format', () => {
      expect(validateFieldValue('212-555-1234', 'text', [{ type: 'phone' }]).valid).toBe(false);
      expect(validateFieldValue('1234567890', 'text', [{ type: 'phone' }]).valid).toBe(false);
    });
  });

  describe('ZIP code validation', () => {
    it('validates 5-digit ZIP', () => {
      expect(validateFieldValue('10001', 'text', [{ type: 'zipCode5' }]).valid).toBe(true);
      expect(validateFieldValue('1234', 'text', [{ type: 'zipCode5' }]).valid).toBe(false);
      expect(validateFieldValue('123456', 'text', [{ type: 'zipCode5' }]).valid).toBe(false);
    });

    it('validates 9-digit ZIP+4', () => {
      expect(validateFieldValue('10001-1234', 'text', [{ type: 'zipCode9' }]).valid).toBe(true);
      expect(validateFieldValue('10001', 'text', [{ type: 'zipCode9' }]).valid).toBe(false);
    });
  });

  describe('SSN validation', () => {
    it('validates SSN format', () => {
      expect(validateFieldValue('123-45-6789', 'text', [{ type: 'ssn' }]).valid).toBe(true);
      expect(validateFieldValue('123456789', 'text', [{ type: 'ssn' }]).valid).toBe(false);
    });
  });

  describe('URL validation', () => {
    it('validates URLs', () => {
      expect(validateFieldValue('https://example.com', 'text', [{ type: 'url' }]).valid).toBe(true);
      expect(validateFieldValue('not-a-url', 'text', [{ type: 'url' }]).valid).toBe(false);
    });
  });

  describe('regex validation', () => {
    it('validates against custom pattern', () => {
      const rule = { type: 'regex' as const, pattern: '^[A-Z]{2}-\\d{4}$', message: 'Invalid code' };
      expect(validateFieldValue('AB-1234', 'text', [rule]).valid).toBe(true);
      expect(validateFieldValue('ab-1234', 'text', [rule]).valid).toBe(false);
    });
  });

  describe('text length validation', () => {
    it('validates min/max length', () => {
      const rules = [{ type: 'text' as const, min: 3, max: 10 }];
      expect(validateFieldValue('abc', 'text', rules).valid).toBe(true);
      expect(validateFieldValue('ab', 'text', rules).valid).toBe(false);
      expect(validateFieldValue('a'.repeat(11), 'text', rules).valid).toBe(false);
    });
  });
});

describe('maskSSN', () => {
  it('masks first 5 digits', () => {
    expect(maskSSN('123-45-6789')).toBe('***-**-6789');
  });

  it('returns input unchanged if not valid SSN', () => {
    expect(maskSSN('invalid')).toBe('invalid');
  });
});
