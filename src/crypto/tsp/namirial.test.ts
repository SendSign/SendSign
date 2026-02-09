import { describe, it, expect, beforeEach } from 'vitest';
import { NamirialTSP } from './namirial.js';

describe('NamirialTSP', () => {
  let tsp: NamirialTSP;

  beforeEach(() => {
    // Ensure no real API key for testing (mock mode)
    delete process.env.NAMIRIAL_API_KEY;
    tsp = new NamirialTSP();
  });

  it('should have correct provider info', () => {
    expect(tsp.name).toBe('Namirial Qualified Signature Service');
    expect(tsp.providerId).toBe('namirial');
  });

  it('should initiate a QES session in mock mode', async () => {
    const session = await tsp.initiateQES({
      name: 'Alice Test',
      email: 'alice@test.com',
      phone: '+39123456789',
    });

    expect(session.sessionId).toBeTruthy();
    expect(session.provider).toBe('namirial');
    expect(session.status).toBe('identity_pending');
    expect(session.identityVerificationUrl).toContain('namirial.com');
    expect(session.expiresAt).toBeTruthy();
  });

  it('should advance status through mock states', async () => {
    const session = await tsp.initiateQES({
      name: 'Bob Test',
      email: 'bob@test.com',
    });

    // First check: identity_pending → identity_verified
    let status = await tsp.checkStatus(session.sessionId);
    expect(status).toBe('identity_verified');

    // Second check: identity_verified → signing_ready
    status = await tsp.checkStatus(session.sessionId);
    expect(status).toBe('signing_ready');
  });

  it('should return failed for unknown session', async () => {
    const status = await tsp.checkStatus('nonexistent-session');
    expect(status).toBe('failed');
  });

  it('should get a mock qualified certificate', async () => {
    const session = await tsp.initiateQES({
      name: 'Charlie Test',
      email: 'charlie@test.com',
    });

    const cert = await tsp.getQualifiedCertificate(session.sessionId);
    expect(cert).toBeInstanceOf(Buffer);
    expect(cert.toString()).toContain('BEGIN CERTIFICATE');
    expect(cert.toString()).toContain('Namirial');
    expect(cert.toString()).toContain('Charlie Test');
  });

  it('should throw for certificate with unknown session', async () => {
    await expect(tsp.getQualifiedCertificate('nonexistent')).rejects.toThrow('Session not found');
  });

  it('should sign with QSCD in mock mode', async () => {
    const session = await tsp.initiateQES({
      name: 'Eve Test',
      email: 'eve@test.com',
    });

    const documentHash = 'abc123def456';
    const result = await tsp.signWithQSCD(session.sessionId, documentHash);

    expect(result.signature).toBeInstanceOf(Buffer);
    expect(result.signature.length).toBeGreaterThan(0);
    expect(result.certificate).toBeInstanceOf(Buffer);
    expect(result.timestamp).toBeTruthy();
    expect(result.tspName).toBe('Namirial Qualified Signature Service');
    expect(result.certificateSerial).toContain('NAMIRIAL');
    expect(result.qscdReference).toContain('QSCD-NAM');
  });

  it('should throw for signing with unknown session', async () => {
    await expect(tsp.signWithQSCD('nonexistent', 'hash')).rejects.toThrow('Session not found');
  });
});
