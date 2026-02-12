import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { uploadDocument, downloadDocument, deleteDocument, getSignedUrl } from './documentStore.js';

/**
 * Integration tests for document store — requires MinIO running via docker-compose.
 * Set environment variables before running:
 *   S3_ENDPOINT=http://localhost:9000
 *   S3_ACCESS_KEY=minioadmin
 *   S3_SECRET_KEY=minioadmin
 *   S3_BUCKET=sendsign-documents
 *   ENCRYPTION_KEY=test-encryption-key-for-dev-only
 */

describe('documentStore (integration)', () => {
  beforeAll(() => {
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = 'minioadmin';
    process.env.S3_SECRET_KEY = 'minioadmin';
    process.env.S3_BUCKET = 'sendsign-documents';
    process.env.S3_REGION = 'us-east-1';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-for-dev-only';
  });

  it('upload → download round-trip preserves data', async () => {
    const testData = Buffer.from('Test PDF content for document store');
    const key = await uploadDocument(testData, { filename: 'test.pdf' });

    expect(key).toMatch(/^documents\//);

    const downloaded = await downloadDocument(key);
    expect(downloaded.equals(testData)).toBe(true);

    // Cleanup
    await deleteDocument(key);
  });

  it('getSignedUrl returns a URL string', async () => {
    const testData = Buffer.from('Pre-signed URL test');
    const key = await uploadDocument(testData);

    const url = await getSignedUrl(key, 300);
    expect(typeof url).toBe('string');
    expect(url).toContain(key);

    // Cleanup
    await deleteDocument(key);
  });

  it('downloadDocument throws for non-existent key', async () => {
    await expect(downloadDocument('documents/nonexistent-key')).rejects.toThrow();
  });

  it('handles large documents', async () => {
    const largeData = Buffer.alloc(5 * 1024 * 1024, 0x42); // 5 MB
    const key = await uploadDocument(largeData, { filename: 'large.pdf' });
    const downloaded = await downloadDocument(key);
    expect(downloaded.equals(largeData)).toBe(true);

    await deleteDocument(key);
  });
});
