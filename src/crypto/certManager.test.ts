import { describe, it, expect, afterAll } from 'vitest';
import forge from 'node-forge';
import fs from 'node:fs';
import path from 'node:path';
import { generateSelfSignedCert, ensureCertificates } from './certManager.js';

const TEST_CERTS_DIR = path.resolve(process.cwd(), 'certs/test');

afterAll(() => {
  // Clean up test certs
  try {
    if (fs.existsSync(TEST_CERTS_DIR)) {
      fs.rmSync(TEST_CERTS_DIR, { recursive: true });
    }
  } catch { /* ignore */ }
});

describe('generateSelfSignedCert', () => {
  it('generates valid PEM key and certificate', async () => {
    const { privateKey, certificate } = await generateSelfSignedCert();

    expect(privateKey).toContain('-----BEGIN RSA PRIVATE KEY-----');
    expect(certificate).toContain('-----BEGIN CERTIFICATE-----');

    // Verify they can be parsed
    const key = forge.pki.privateKeyFromPem(privateKey);
    const cert = forge.pki.certificateFromPem(certificate);

    expect(key).toBeTruthy();
    expect(cert).toBeTruthy();
    expect(cert.subject.getField('CN')?.value).toBe('CoSeal Self-Signed Certificate');
  });

  it('generates a certificate valid for 10 years', async () => {
    const { certificate } = await generateSelfSignedCert();
    const cert = forge.pki.certificateFromPem(certificate);

    const notBefore = cert.validity.notBefore;
    const notAfter = cert.validity.notAfter;

    const diffYears = (notAfter.getTime() - notBefore.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    expect(diffYears).toBeCloseTo(10, 0);
  });
});

describe('ensureCertificates', () => {
  it('generates certs if they do not exist', async () => {
    const certPath = path.join(TEST_CERTS_DIR, 'test-cert.pem');
    const keyPath = path.join(TEST_CERTS_DIR, 'test-key.pem');

    const result = await ensureCertificates(certPath, keyPath);

    expect(result.privateKey).toBeTruthy();
    expect(result.certificate).toBeTruthy();
    expect(fs.existsSync(certPath)).toBe(true);
    expect(fs.existsSync(keyPath)).toBe(true);
  });

  it('loads existing certs if they exist', async () => {
    const certPath = path.join(TEST_CERTS_DIR, 'test-cert.pem');
    const keyPath = path.join(TEST_CERTS_DIR, 'test-key.pem');

    // First call generates
    await ensureCertificates(certPath, keyPath);
    const certBefore = fs.readFileSync(certPath, 'utf-8');

    // Second call loads existing
    const result = await ensureCertificates(certPath, keyPath);
    const certAfter = fs.readFileSync(certPath, 'utf-8');

    expect(certBefore).toBe(certAfter); // Same cert, not regenerated
    expect(result.certificate).toBeTruthy();
  });
});
