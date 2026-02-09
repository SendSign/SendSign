import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

export interface EncryptionResult {
  encrypted: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/**
 * Encrypt data using AES-256-GCM.
 * @param data - The plaintext buffer to encrypt
 * @param key  - 32-byte encryption key
 */
export async function encrypt(data: Buffer, key: Buffer): Promise<EncryptionResult> {
  const iv = generateIV();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv, tag };
}

/**
 * Decrypt data encrypted with AES-256-GCM.
 */
export async function decrypt(
  encrypted: Buffer,
  key: Buffer,
  iv: Buffer,
  tag: Buffer,
): Promise<Buffer> {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Derive a 256-bit key from a passphrase using PBKDF2.
 */
export function deriveKey(passphrase: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
  const s = salt ?? crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passphrase, s, 100_000, 32, 'sha256');
  return { key, salt: s };
}

/**
 * Generate a random 96-bit IV for AES-GCM.
 */
export function generateIV(): Buffer {
  return crypto.randomBytes(IV_LENGTH);
}

/**
 * Pack encrypted data, IV, and tag into a single buffer for storage.
 * Layout: [IV (12)] [TAG (16)] [ENCRYPTED (...)]
 */
export function pack(result: EncryptionResult): Buffer {
  return Buffer.concat([result.iv, result.tag, result.encrypted]);
}

/**
 * Unpack a packed buffer into its components.
 */
export function unpack(packed: Buffer): EncryptionResult {
  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + TAG_LENGTH);
  return { iv, tag, encrypted };
}
