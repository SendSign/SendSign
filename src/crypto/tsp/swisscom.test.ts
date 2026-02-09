import { describe, it, expect, beforeEach } from 'vitest';
import { SwisscomTSP } from './swisscom.js';

describe('SwisscomTSP', () => {
  let tsp: SwisscomTSP;

  beforeEach(() => {
    // Ensure no real API key for testing (mock mode)
    delete process.env.SWISSCOM_AIS_KEY;
    tsp = new SwisscomTSP();
  });

  it('should have correct provider info', () => {
    expect(tsp.name).toBe('Swisscom All-in Signing Service');
    expect(tsp.providerId).toBe('swisscom');
  });

  it('should initiate a QES session in mock mode', async () => {
    const session = await tsp.initiateQES({
      name: 'Alice Test',
      email: 'alice@test.com',
      phone: '+41791234567',
    });

    expect(session.sessionId).toBeTruthy();
    expect(session.provider).toBe('swisscom');
    expect(session.status).toBe('identity_pending');
    expect(session.identityVerificationUrl).toContain('swisscom.ch');
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
    expect(cert.toString()).toContain('Swisscom');
    expect(cert.toString()).toContain('Charlie Test');
  });

  it('should throw for certificate with unknown session', async () => {
    await expect(tsp.getQualifiedCertificate('nonexistent')).rejects.toThrow('Session not found');
  });

  it('should sign with QSCD in mock mode', async () => {
    const session = await tsp.initiateQES({
      name: 'Dave Test',
      email: 'dave@test.com',
    });

    const documentHash = 'abc123def456';
    const result = await tsp.signWithQSCD(session.sessionId, documentHash);

    expect(result.signature).toBeInstanceOf(Buffer);
    expect(result.signature.length).toBeGreaterThan(0);
    expect(result.certificate).toBeInstanceOf(Buffer);
    expect(result.timestamp).toBeTruthy();
    expect(result.tspName).toBe('Swisscom All-in Signing Service');
    expect(result.certificateSerial).toContain('MOCK');
    expect(result.qscdReference).toContain('QSCD');
  });

  it('should throw for signing with unknown session', async () => {
    await expect(tsp.signWithQSCD('nonexistent', 'hash')).rejects.toThrow('Session not found');
  });
});
