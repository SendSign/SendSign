import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generateSelfSignedCert } from './certManager.js';
import { sealDocument, verifySealedDocument } from './sealer.js';
import { hashDocument, verifyHash } from './hasher.js';
import forge from 'node-forge';

let privateKey: forge.pki.PrivateKey;
let certificate: forge.pki.Certificate;
let testPdfBuffer: Buffer;

async function createTestPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Document for Sealing Test', {
    x: 50,
    y: 700,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });
  return Buffer.from(await doc.save());
}

beforeAll(async () => {
  const certs = await generateSelfSignedCert();
  privateKey = forge.pki.privateKeyFromPem(certs.privateKey);
  certificate = forge.pki.certificateFromPem(certs.certificate);
  testPdfBuffer = await createTestPdf();
});

describe('sealDocument', () => {
  it('seals a PDF and produces a larger output', async () => {
    const sealed = await sealDocument(testPdfBuffer, privateKey, certificate);
    expect(sealed.length).toBeGreaterThan(testPdfBuffer.length);
  });

  it('sealed PDF contains SendSign metadata', async () => {
    const sealed = await sealDocument(testPdfBuffer, privateKey, certificate);
    const pdfDoc = await PDFDocument.load(sealed);

    const subject = pdfDoc.getSubject();
    expect(subject).toBeTruthy();
    const sealInfo = JSON.parse(subject!);
    expect(sealInfo.sendsign_version).toBe('0.1.0');
    expect(sealInfo.hash_algorithm).toBe('SHA-256');
    expect(sealInfo.document_hash).toBeTruthy();
  });
});

describe('verifySealedDocument', () => {
  it('verifies a sealed document', async () => {
    const sealed = await sealDocument(testPdfBuffer, privateKey, certificate);
    const result = await verifySealedDocument(sealed);

    expect(result.valid).toBe(true);
    expect(result.documentHash).toBe(hashDocument(testPdfBuffer));
    expect(result.sealedAt).toBeTruthy();
    expect(result.certificateSubject).toContain('SendSign');
  });

  it('returns invalid for unsigned PDF', async () => {
    const result = await verifySealedDocument(testPdfBuffer);
    expect(result.valid).toBe(false);
  });
});

describe('seal → verify round-trip', () => {
  it('hash matches between seal and verify', async () => {
    const originalHash = hashDocument(testPdfBuffer);
    const sealed = await sealDocument(testPdfBuffer, privateKey, certificate);
    const verifyResult = await verifySealedDocument(sealed);

    expect(verifyResult.documentHash).toBe(originalHash);
  });
});
