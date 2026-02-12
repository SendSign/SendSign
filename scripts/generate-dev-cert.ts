#!/usr/bin/env npx tsx

/**
 * Generate a self-signed certificate for SendSign development.
 * Usage: npx tsx scripts/generate-dev-cert.ts
 */

import { generateSelfSignedCert } from '../src/crypto/certManager.js';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const certsDir = path.resolve(process.cwd(), 'certs');

  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  const certPath = path.join(certsDir, 'signing-cert.pem');
  const keyPath = path.join(certsDir, 'signing-key.pem');

  console.log('Generating self-signed certificate for SendSign development...');
  const { privateKey, certificate } = await generateSelfSignedCert();

  fs.writeFileSync(certPath, certificate, 'utf-8');
  fs.writeFileSync(keyPath, privateKey, 'utf-8');

  console.log(`✓ Certificate saved to: ${certPath}`);
  console.log(`✓ Private key saved to: ${keyPath}`);
  console.log('');
  console.log('WARNING: This is a self-signed certificate for development only.');
  console.log('For production, obtain a certificate from a trusted Certificate Authority.');
}

main().catch(console.error);
