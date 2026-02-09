import { describe, it, expect } from 'vitest';
import { generateSigningToken, generateTokenExpiry } from './tokenGenerator.js';

describe('generateSigningToken', () => {
  it('generates a UUID v4 string', () => {
    const token = generateSigningToken();
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique tokens', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateSigningToken());
    }
    expect(tokens.size).toBe(100);
  });
});

describe('generateTokenExpiry', () => {
  it('defaults to 72 hours from now', () => {
    const before = Date.now();
    const expiry = generateTokenExpiry();
    const after = Date.now();

    const expectedMin = before + 72 * 60 * 60 * 1000;
    const expectedMax = after + 72 * 60 * 60 * 1000;

    expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(expiry.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it('respects custom hours', () => {
    const before = Date.now();
    const expiry = generateTokenExpiry(24);
    const after = Date.now();

    const expectedMin = before + 24 * 60 * 60 * 1000;
    const expectedMax = after + 24 * 60 * 60 * 1000;

    expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(expiry.getTime()).toBeLessThanOrEqual(expectedMax);
  });
});
