import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { encrypt, decrypt, deriveKey, pack, unpack } from './encryption.js';

describe('encryption', () => {
  const key = crypto.randomBytes(32);
  const plaintext = Buffer.from('Hello, CoSeal! This is a test document.');

  it('encrypt → decrypt round-trip produces original data', async () => {
    const result = await encrypt(plaintext, key);
    const decrypted = await decrypt(result.encrypted, key, result.iv, result.tag);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('encrypted data differs from plaintext', async () => {
    const result = await encrypt(plaintext, key);
    expect(result.encrypted.equals(plaintext)).toBe(false);
  });

  it('each encryption produces a different IV', async () => {
    const result1 = await encrypt(plaintext, key);
    const result2 = await encrypt(plaintext, key);
    expect(result1.iv.equals(result2.iv)).toBe(false);
  });

  it('decryption with wrong key fails', async () => {
    const result = await encrypt(plaintext, key);
    const wrongKey = crypto.randomBytes(32);
    await expect(decrypt(result.encrypted, wrongKey, result.iv, result.tag)).rejects.toThrow();
  });

  it('decryption with tampered data fails', async () => {
    const result = await encrypt(plaintext, key);
    const tampered = Buffer.from(result.encrypted);
    tampered[0] ^= 0xff;
    await expect(decrypt(tampered, key, result.iv, result.tag)).rejects.toThrow();
  });

  it('decryption with tampered tag fails', async () => {
    const result = await encrypt(plaintext, key);
    const tamperedTag = Buffer.from(result.tag);
    tamperedTag[0] ^= 0xff;
    await expect(decrypt(result.encrypted, key, result.iv, tamperedTag)).rejects.toThrow();
  });

  it('handles empty buffer', async () => {
    const empty = Buffer.alloc(0);
    const result = await encrypt(empty, key);
    const decrypted = await decrypt(result.encrypted, key, result.iv, result.tag);
    expect(decrypted.length).toBe(0);
  });

  it('handles large buffer', async () => {
    const large = crypto.randomBytes(10 * 1024 * 1024); // 10 MB
    const result = await encrypt(large, key);
    const decrypted = await decrypt(result.encrypted, key, result.iv, result.tag);
    expect(decrypted.equals(large)).toBe(true);
  });
});

describe('deriveKey', () => {
  it('derives consistent key from same passphrase and salt', () => {
    const { key: key1, salt } = deriveKey('my-secret-passphrase');
    const { key: key2 } = deriveKey('my-secret-passphrase', salt);
    expect(key1.equals(key2)).toBe(true);
  });

  it('different passphrases produce different keys', () => {
    const salt = crypto.randomBytes(16);
    const { key: key1 } = deriveKey('passphrase-one', salt);
    const { key: key2 } = deriveKey('passphrase-two', salt);
    expect(key1.equals(key2)).toBe(false);
  });

  it('produces a 32-byte key', () => {
    const { key } = deriveKey('test-passphrase');
    expect(key.length).toBe(32);
  });
});

describe('pack / unpack', () => {
  it('round-trips correctly', async () => {
    const key = crypto.randomBytes(32);
    const original = Buffer.from('pack-unpack test data');
    const encResult = await encrypt(original, key);
    const packed = pack(encResult);
    const unpacked = unpack(packed);

    expect(unpacked.iv.equals(encResult.iv)).toBe(true);
    expect(unpacked.tag.equals(encResult.tag)).toBe(true);
    expect(unpacked.encrypted.equals(encResult.encrypted)).toBe(true);

    const decrypted = await decrypt(unpacked.encrypted, key, unpacked.iv, unpacked.tag);
    expect(decrypted.equals(original)).toBe(true);
  });
});
