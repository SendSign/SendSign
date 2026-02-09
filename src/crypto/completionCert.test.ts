import { describe, it, expect } from 'vitest';
import { generateCompletionCertificate } from './completionCert.js';
import { parsePdf } from '../documents/pdfRenderer.js';
import type { EnvelopeWithDetails } from './completionCert.js';

describe('generateCompletionCertificate', () => {
  it('generates a valid PDF', async () => {
    const envelope: EnvelopeWithDetails = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      subject: 'Test NDA Agreement',
      createdAt: '2024-01-10T10:00:00Z',
      completedAt: '2024-01-12T15:30:00Z',
      documentHash: 'a'.repeat(64),
      signers: [
        {
          name: 'Alice Smith',
          email: 'alice@example.com',
          status: 'completed',
          signedAt: '2024-01-11T09:00:00Z',
          ipAddress: '192.168.1.1',
        },
        {
          name: 'Bob Jones',
          email: 'bob@example.com',
          status: 'completed',
          signedAt: '2024-01-12T15:30:00Z',
          ipAddress: '10.0.0.5',
        },
      ],
      auditTrail: [
        { eventType: 'created', timestamp: '2024-01-10T10:00:00Z' },
        { eventType: 'sent', timestamp: '2024-01-10T10:01:00Z' },
        { eventType: 'viewed', timestamp: '2024-01-11T08:50:00Z', signerName: 'Alice Smith', ipAddress: '192.168.1.1' },
        { eventType: 'signed', timestamp: '2024-01-11T09:00:00Z', signerName: 'Alice Smith', ipAddress: '192.168.1.1' },
        { eventType: 'viewed', timestamp: '2024-01-12T15:20:00Z', signerName: 'Bob Jones', ipAddress: '10.0.0.5' },
        { eventType: 'signed', timestamp: '2024-01-12T15:30:00Z', signerName: 'Bob Jones', ipAddress: '10.0.0.5' },
        { eventType: 'sealed', timestamp: '2024-01-12T15:30:01Z' },
      ],
    };

    const pdfBuffer = await generateCompletionCertificate(envelope);

    expect(pdfBuffer.length).toBeGreaterThan(0);
    const parsed = await parsePdf(pdfBuffer);
    expect(parsed.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('handles envelope with many audit events', async () => {
    const auditTrail = Array.from({ length: 100 }, (_, i) => ({
      eventType: 'viewed',
      timestamp: `2024-01-${String(Math.floor(i / 10) + 10).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
      signerName: `Signer ${i}`,
      ipAddress: `10.0.0.${i}`,
    }));

    const envelope: EnvelopeWithDetails = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      subject: 'Large Audit Trail Test',
      createdAt: '2024-01-10T10:00:00Z',
      completedAt: '2024-01-20T10:00:00Z',
      documentHash: 'b'.repeat(64),
      signers: [{ name: 'Test Signer', email: 'test@example.com', status: 'completed', signedAt: '2024-01-20T10:00:00Z', ipAddress: '10.0.0.1' }],
      auditTrail,
    };

    const pdfBuffer = await generateCompletionCertificate(envelope);
    const parsed = await parsePdf(pdfBuffer);
    expect(parsed.pageCount).toBeGreaterThan(1); // Should span multiple pages
  });
});
