import forge from 'node-forge';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Load a PEM-encoded private key from a file.
 */
export async function loadSigningKey(keyPath: string): Promise<forge.pki.PrivateKey> {
  const pem = fs.readFileSync(keyPath, 'utf-8');
  return forge.pki.privateKeyFromPem(pem);
}

/**
 * Load a PEM-encoded X.509 certificate from a file.
 */
export async function loadCertificate(certPath: string): Promise<forge.pki.Certificate> {
  const pem = fs.readFileSync(certPath, 'utf-8');
  return forge.pki.certificateFromPem(pem);
}

/**
 * Generate a self-signed X.509 certificate for development use.
 */
export async function generateSelfSignedCert(): Promise<{
  privateKey: string;
  certificate: string;
}> {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: 'CoSeal Self-Signed Certificate' },
    { name: 'organizationName', value: 'CoSeal' },
    { name: 'countryName', value: 'US' },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    {
      name: 'keyUsage',
      digitalSignature: true,
      nonRepudiation: true,
    },
    {
      name: 'subjectAltName',
      altNames: [{ type: 2, value: 'localhost' }],
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    certificate: forge.pki.certificateToPem(cert),
  };
}

/**
 * Ensure signing cert and key exist at configured paths.
 * If not, generate a self-signed pair and warn.
 */
export async function ensureCertificates(
  certPath: string,
  keyPath: string,
): Promise<{ privateKey: forge.pki.PrivateKey; certificate: forge.pki.Certificate }> {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const [privateKey, certificate] = await Promise.all([
      loadSigningKey(keyPath),
      loadCertificate(certPath),
    ]);
    return { privateKey, certificate };
  }

  console.warn('⚠ No signing certificate found. Generating self-signed cert for development.');
  console.warn('  For production, provide a CA-issued certificate.');

  const { privateKey: keyPem, certificate: certPem } = await generateSelfSignedCert();

  // Ensure directory exists
  const dir = path.dirname(certPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(certPath, certPem, 'utf-8');
  fs.writeFileSync(keyPath, keyPem, 'utf-8');

  console.warn(`  Certificate saved to: ${certPath}`);
  console.warn(`  Private key saved to: ${keyPath}`);

  return {
    privateKey: forge.pki.privateKeyFromPem(keyPem),
    certificate: forge.pki.certificateFromPem(certPem),
  };
}
