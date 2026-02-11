import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { uploadDocument, downloadDocument } from '../storage/documentStore.js';
import { getDb } from '../db/connection.js';
import { envelopes, signers } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface CertificateData {
  envelopeId: string;
  subject: string;
  documentHash: string;
  signers: Array<{
    name: string;
    email: string;
    signedAt: Date | null;
    ipAddress: string | null;
    consentedAt: Date | null;
  }>;
  completedAt: Date;
}

/**
 * Generate a completion certificate PDF with audit trail.
 */
export async function generateCompletionCertificate(envelopeId: string): Promise<string> {
  const db = getDb();

  // Get envelope
  const [envelope] = await db.select().from(envelopes).where(eq(envelopes.id, envelopeId)).limit(1);
  if (!envelope) {
    throw new Error('Envelope not found');
  }

  // Get all signers
  const allSigners = await db.select().from(signers).where(eq(signers.envelopeId, envelopeId));

  // Calculate document hash from sealed PDF (or original if sealed not available)
  let documentHash = 'N/A';
  try {
    const docKey = envelope.sealedKey || envelope.documentKey;
    if (docKey) {
      const docBuffer = await downloadDocument(docKey);
      documentHash = createHash('sha256').update(docBuffer).digest('hex');
    }
  } catch (err) {
    console.error('Failed to calculate document hash:', err);
  }

  // Create certificate data
  const certData: CertificateData = {
    envelopeId: envelope.id,
    subject: envelope.subject || 'Untitled Document',
    documentHash,
    signers: allSigners.map((s) => ({
      name: s.name,
      email: s.email,
      signedAt: s.signedAt,
      ipAddress: s.ipAddress,
      consentedAt: s.consentedAt,
    })),
    completedAt: envelope.completedAt || new Date(),
  };

  // Create new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();

  // Embed fonts
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  let yPosition = height - 60;

  // Title
  page.drawText('Certificate of Completion', {
    x: 50,
    y: yPosition,
    size: 24,
    font: titleFont,
    color: rgb(0.15, 0.38, 0.91), // Blue
  });

  yPosition -= 40;

  // Subtitle
  page.drawText('Electronic Signature Audit Trail', {
    x: 50,
    y: yPosition,
    size: 14,
    font: bodyFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  yPosition -= 50;

  // Document Information Section
  page.drawText('Document Information', {
    x: 50,
    y: yPosition,
    size: 12,
    font: titleFont,
    color: rgb(0, 0, 0),
  });

  yPosition -= 25;

  const drawField = (label: string, value: string, mono = false) => {
    page.drawText(`${label}:`, {
      x: 50,
      y: yPosition,
      size: 10,
      font: bodyFont,
      color: rgb(0.3, 0.3, 0.3),
    });

    const lines = wrapText(value, mono ? monoFont : bodyFont, 10, 450);
    for (const line of lines) {
      page.drawText(line, {
        x: 180,
        y: yPosition,
        size: 10,
        font: mono ? monoFont : bodyFont,
        color: rgb(0, 0, 0),
      });
      yPosition -= 15;
    }
  };

  drawField('Subject', certData.subject);
  drawField('Envelope ID', certData.envelopeId, true);
  drawField('Completed At', certData.completedAt.toISOString());
  drawField('Document Hash (SHA-256)', documentHash, true);

  yPosition -= 20;

  // Signers Section
  page.drawText('Signers', {
    x: 50,
    y: yPosition,
    size: 12,
    font: titleFont,
    color: rgb(0, 0, 0),
  });

  yPosition -= 25;

  certData.signers.forEach((signer, index) => {
    // Draw signer box
    page.drawRectangle({
      x: 50,
      y: yPosition - 80,
      width: width - 100,
      height: 85,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
      color: rgb(0.98, 0.98, 0.98),
    });

    page.drawText(`Signer ${index + 1}`, {
      x: 60,
      y: yPosition - 20,
      size: 10,
      font: titleFont,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Name: ${signer.name}`, {
      x: 60,
      y: yPosition - 35,
      size: 9,
      font: bodyFont,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Email: ${signer.email}`, {
      x: 60,
      y: yPosition - 50,
      size: 9,
      font: bodyFont,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Signed: ${signer.signedAt ? signer.signedAt.toISOString() : 'Not signed'}`, {
      x: 60,
      y: yPosition - 65,
      size: 9,
      font: bodyFont,
      color: rgb(0, 0, 0),
    });

    if (signer.ipAddress) {
      page.drawText(`IP Address: ${signer.ipAddress}`, {
        x: 350,
        y: yPosition - 50,
        size: 8,
        font: monoFont,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    if (signer.consentedAt) {
      page.drawText(`Consented: ${signer.consentedAt.toISOString()}`, {
        x: 350,
        y: yPosition - 65,
        size: 8,
        font: bodyFont,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    yPosition -= 100;

    // Add new page if running out of space
    if (yPosition < 100 && index < certData.signers.length - 1) {
      const newPage = pdfDoc.addPage([612, 792]);
      yPosition = height - 60;
    }
  });

  // Footer
  const footerY = 50;
  page.drawText('This certificate was generated automatically by CoSeal.', {
    x: 50,
    y: footerY,
    size: 8,
    font: bodyFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText('Electronic signatures are legally binding under the ESIGN Act (US), eIDAS (EU), and equivalent laws.', {
    x: 50,
    y: footerY - 12,
    size: 7,
    font: bodyFont,
    color: rgb(0.6, 0.6, 0.6),
  });

  // Serialize PDF
  const pdfBytes = await pdfDoc.save();

  // Upload to storage
  const certificateKey = await uploadDocument(Buffer.from(pdfBytes), {
    filename: `certificate_${envelopeId}.pdf`,
    contentType: 'application/pdf',
    envelopeId,
  });

  // Update envelope with certificate key
  await db.update(envelopes).set({ completionCertKey: certificateKey, updatedAt: new Date() }).where(eq(envelopes.id, envelopeId));

  return certificateKey;
}

/**
 * Wrap text to fit within a given width.
 */
function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, size);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
