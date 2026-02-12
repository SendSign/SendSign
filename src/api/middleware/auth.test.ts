import { describe, it, expect } from 'vitest';
import { hashApiKey } from './auth.js';

describe('Auth Middleware', () => {
  describe('hashApiKey', () => {
    it('should produce consistent SHA-256 hash', () => {
      const key = 'sendsign_test_key_123';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('key_one');
      const hash2 = hashApiKey('key_two');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce hex string', () => {
      const hash = hashApiKey('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
