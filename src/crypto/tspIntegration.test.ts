import { describe, it, expect, beforeEach } from 'vitest';
import { getTSP, getConfiguredTSP, isQESAvailable } from './tspIntegration.js';

describe('tspIntegration', () => {
  beforeEach(() => {
    delete process.env.QES_PROVIDER;
    delete process.env.SWISSCOM_AIS_KEY;
    delete process.env.NAMIRIAL_API_KEY;
  });

  describe('getConfiguredTSP', () => {
    it('should return null when no provider configured', () => {
      expect(getConfiguredTSP()).toBeNull();
    });

    it('should return provider name when configured', () => {
      process.env.QES_PROVIDER = 'swisscom';
      expect(getConfiguredTSP()).toBe('swisscom');
      delete process.env.QES_PROVIDER;
    });
  });

  describe('isQESAvailable', () => {
    it('should return false when no provider configured', () => {
      expect(isQESAvailable()).toBe(false);
    });

    it('should return true when provider configured', () => {
      process.env.QES_PROVIDER = 'namirial';
      expect(isQESAvailable()).toBe(true);
      delete process.env.QES_PROVIDER;
    });
  });

  describe('getTSP', () => {
    it('should return SwisscomTSP for swisscom provider', async () => {
      const tsp = await getTSP('swisscom');
      expect(tsp.providerId).toBe('swisscom');
      expect(tsp.name).toContain('Swisscom');
    });

    it('should return NamirialTSP for namirial provider', async () => {
      const tsp = await getTSP('namirial');
      expect(tsp.providerId).toBe('namirial');
      expect(tsp.name).toContain('Namirial');
    });

    it('should be case-insensitive', async () => {
      const tsp = await getTSP('Swisscom');
      expect(tsp.providerId).toBe('swisscom');
    });

    it('should throw for unknown provider', async () => {
      await expect(getTSP('unknown_provider')).rejects.toThrow('Unknown QES provider');
    });

    it('should include helpful error message for unknown provider', async () => {
      try {
        await getTSP('invalid');
      } catch (err: unknown) {
        const error = err as Error;
        expect(error.message).toContain('Supported providers');
        expect(error.message).toContain('swisscom');
        expect(error.message).toContain('namirial');
        expect(error.message).toContain('docs/COMPLIANCE.md');
      }
    });
  });

  describe('full QES flow (mock mode)', () => {
    it('should complete QES flow with Swisscom', async () => {
      const tsp = await getTSP('swisscom');

      // 1. Initiate
      const session = await tsp.initiateQES({
        name: 'QES User',
        email: 'qes@test.com',
        phone: '+41791234567',
      });
      expect(session.status).toBe('identity_pending');

      // 2. Check status (identity verification)
      let status = await tsp.checkStatus(session.sessionId);
      expect(status).toBe('identity_verified');

      // 3. Check status (ready to sign)
      status = await tsp.checkStatus(session.sessionId);
      expect(status).toBe('signing_ready');

      // 4. Get certificate
      const cert = await tsp.getQualifiedCertificate(session.sessionId);
      expect(cert.length).toBeGreaterThan(0);

      // 5. Sign
      const result = await tsp.signWithQSCD(session.sessionId, 'document-hash-abc');
      expect(result.signature.length).toBeGreaterThan(0);
      expect(result.tspName).toContain('Swisscom');
    });

    it('should complete QES flow with Namirial', async () => {
      const tsp = await getTSP('namirial');

      // 1. Initiate
      const session = await tsp.initiateQES({
        name: 'EU User',
        email: 'eu@test.com',
        phone: '+39123456789',
      });
      expect(session.status).toBe('identity_pending');

      // 2-3. Check status twice to advance
      await tsp.checkStatus(session.sessionId);
      const status = await tsp.checkStatus(session.sessionId);
      expect(status).toBe('signing_ready');

      // 4. Sign
      const result = await tsp.signWithQSCD(session.sessionId, 'eu-document-hash');
      expect(result.signature.length).toBeGreaterThan(0);
      expect(result.tspName).toContain('Namirial');
      expect(result.qscdReference).toContain('QSCD-NAM');
    });
  });
});
