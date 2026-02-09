import crypto from 'node:crypto';

/**
 * Compute SHA-256 hash of a buffer, returns hex string.
 */
export function hashDocument(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify that a buffer matches the expected SHA-256 hash.
 */
export function verifyHash(data: Buffer, expectedHash: string): boolean {
  const actualHash = hashDocument(data);
  return actualHash === expectedHash;
}
