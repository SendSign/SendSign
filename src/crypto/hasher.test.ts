import { describe, it, expect } from 'vitest';
import { hashDocument, verifyHash } from './hasher.js';

describe('hashDocument', () => {
  it('returns a hex string', () => {
    const hash = hashDocument(Buffer.from('Hello, World!'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces consistent hash for same input', () => {
    const data = Buffer.from('Consistent hashing test');
    const hash1 = hashDocument(data);
    const hash2 = hashDocument(data);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different input', () => {
    const hash1 = hashDocument(Buffer.from('Input A'));
    const hash2 = hashDocument(Buffer.from('Input B'));
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty buffer', () => {
    const hash = hashDocument(Buffer.alloc(0));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Known SHA-256 of empty input
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('verifyHash', () => {
  it('returns true for matching hash', () => {
    const data = Buffer.from('Verify this content');
    const hash = hashDocument(data);
    expect(verifyHash(data, hash)).toBe(true);
  });

  it('returns false for mismatched hash', () => {
    const data = Buffer.from('Original content');
    const hash = hashDocument(Buffer.from('Modified content'));
    expect(verifyHash(data, hash)).toBe(false);
  });

  it('returns false if data is tampered', () => {
    const original = Buffer.from('Tamper test');
    const hash = hashDocument(original);
    const tampered = Buffer.from('Tamper test!');
    expect(verifyHash(tampered, hash)).toBe(false);
  });
});
