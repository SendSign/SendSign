/**
 * Mail Merge Tests — Step 29
 */

import { describe, it, expect } from 'vitest';
import { extractPlaceholders, validateMergeData, parseCsvForMerge } from './mailMerge.js';

describe('extractPlaceholders', () => {
  it('should extract placeholders from text', () => {
    const text = 'Hello {{name}}, your amount is {{amount}}. Thank you!';
    const placeholders = extractPlaceholders(text);

    expect(placeholders).toContain('name');
    expect(placeholders).toContain('amount');
    expect(placeholders).toHaveLength(2);
  });

  it('should handle multiple occurrences of same placeholder', () => {
    const text = '{{name}} signed on {{date}}. {{name}} is the signatory.';
    const placeholders = extractPlaceholders(text);

    // Should deduplicate
    expect(placeholders).toContain('name');
    expect(placeholders).toContain('date');
    expect(placeholders).toHaveLength(2);
  });

  it('should return empty array when no placeholders', () => {
    const text = 'This document has no merge fields.';
    const placeholders = extractPlaceholders(text);

    expect(placeholders).toHaveLength(0);
  });

  it('should handle whitespace inside placeholders', () => {
    const text = '{{ client_name }} and {{ contract_date }}';
    const placeholders = extractPlaceholders(text);

    expect(placeholders).toContain('client_name');
    expect(placeholders).toContain('contract_date');
  });
});

describe('validateMergeData', () => {
  it('should validate complete merge data', () => {
    const templatePlaceholders = ['name', 'amount', 'date'];
    const data = {
      name: 'Alice',
      amount: '$50,000',
      date: '2026-02-08',
    };

    const validation = validateMergeData(templatePlaceholders, data);

    expect(validation.valid).toBe(true);
    expect(validation.missingFields).toHaveLength(0);
    expect(validation.extraFields).toHaveLength(0);
  });

  it('should detect missing required fields', () => {
    const templatePlaceholders = ['name', 'amount', 'date'];
    const data = {
      name: 'Alice',
      // Missing: amount, date
    };

    const validation = validateMergeData(templatePlaceholders, data);

    expect(validation.valid).toBe(false);
    expect(validation.missingFields).toContain('amount');
    expect(validation.missingFields).toContain('date');
    expect(validation.missingFields).toHaveLength(2);
  });

  it('should detect extra fields', () => {
    const templatePlaceholders = ['name'];
    const data = {
      name: 'Alice',
      extra1: 'value',
      extra2: 'value',
    };

    const validation = validateMergeData(templatePlaceholders, data);

    expect(validation.valid).toBe(true); // Still valid, just has extra
    expect(validation.extraFields).toContain('extra1');
    expect(validation.extraFields).toContain('extra2');
  });
});

describe('parseCsvForMerge', () => {
  it('should parse CSV with email, name, and merge data', () => {
    const csv = `email,name,client_name,amount
alice@acme.com,Alice,Acme Corp,$50000
bob@globex.com,Bob,Globex Inc,$75000`;

    const recipients = parseCsvForMerge(csv);

    expect(recipients).toHaveLength(2);
    expect(recipients[0].email).toBe('alice@acme.com');
    expect(recipients[0].name).toBe('Alice');
    expect(recipients[0].mergeData.client_name).toBe('Acme Corp');
    expect(recipients[0].mergeData.amount).toBe('$50000');
  });

  it('should handle CSV with only email and name', () => {
    const csv = `email,name
alice@example.com,Alice
bob@example.com,Bob`;

    const recipients = parseCsvForMerge(csv);

    expect(recipients).toHaveLength(2);
    expect(recipients[0].mergeData).toEqual({});
    expect(recipients[1].mergeData).toEqual({});
  });

  it('should skip empty rows', () => {
    const csv = `email,name,company
alice@example.com,Alice,Acme

bob@example.com,Bob,Globex`;

    const recipients = parseCsvForMerge(csv);

    // Should only parse valid rows
    expect(recipients).toHaveLength(2);
  });

  it('should throw on CSV with less than 2 columns', () => {
    const csv = `email
alice@example.com
bob@example.com`;

    expect(() => parseCsvForMerge(csv)).toThrow();
  });

  it('should throw on empty CSV', () => {
    const csv = '';

    expect(() => parseCsvForMerge(csv)).toThrow();
  });
});
