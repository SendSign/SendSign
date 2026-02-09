import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { hashDocument } from './hasher.js';

export interface IdentityVerificationDetail {
  method: string;      // email_sms | government_id | bank_id
  provider: string;    // internal | jumio | onfido
  verifiedAt: string;
  details?: string;
}

export interface QESDetail {
  tspName: string;
  certificateSerial: string;
  qscdReference: string;
  signedAt: string;
}

export interface SignerDetail {
  name: string;
  email: string;
  status: string;
  signedAt: string | null;
  ipAddress: string | null;
  identityVerification?: IdentityVerificationDetail;
  qesDetail?: QESDetail;
  delegatedFrom?: {
    name: string;
    email: string;
    delegatedAt: string;
  };
}

export interface AuditEntry {
  eventType: string;
  timestamp: string;
  signerName?: string;
  ipAddress?: string;
  details?: string;
}

export interface CommentDetail {
  authorName: string;
  authorEmail: string;
  content: string;
  resolved: boolean;
  createdAt: string;
}

export interface EnvelopeWithDetails {
  id: string;
  subject: string;
  createdAt: string;
  completedAt: string | null;
  documentHash: string;
  signers: SignerDetail[];
  auditTrail: AuditEntry[];
  comments?: CommentDetail[];
}

/**
 * Generate a Certificate of Completion PDF.
 */
export async function generateCompletionCertificate(
  envelope: EnvelopeWithDetails,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  // Page dimensions
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawLine = (thickness: number = 1) => {
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 10;
  };

  const drawText = (text: string, options: { font?: typeof font; size?: number; color?: ReturnType<typeof rgb>; indent?: number } = {}) => {
    const f = options.font ?? font;
    const size = options.size ?? 10;
    const color = options.color ?? rgb(0, 0, 0);
    const indent = options.indent ?? 0;

    // Simple word wrap
    const maxWidth = contentWidth - indent;
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const width = f.widthOfTextAtSize(testLine, size);
      if (width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      if (y < margin + 30) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(l, { x: margin + indent, y, size, font: f, color });
      y -= size + 4;
    }
  };

  const newPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  // ─── Header ───
  drawText('CERTIFICATE OF COMPLETION', { font: boldFont, size: 20, color: rgb(0.1, 0.3, 0.6) });
  y -= 5;
  drawText('Powered by CoSeal — Open Source E-Signature Engine', { size: 8, color: rgb(0.5, 0.5, 0.5) });
  y -= 10;
  drawLine(2);
  y -= 5;

  // ─── Document Details ───
  drawText('DOCUMENT DETAILS', { font: boldFont, size: 12, color: rgb(0.1, 0.3, 0.6) });
  y -= 5;
  drawText(`Envelope ID: ${envelope.id}`, { indent: 10 });
  drawText(`Subject: ${envelope.subject}`, { indent: 10 });
  drawText(`Created: ${envelope.createdAt}`, { indent: 10 });
  if (envelope.completedAt) {
    drawText(`Completed: ${envelope.completedAt}`, { indent: 10 });
  }
  drawText(`Document SHA-256: ${envelope.documentHash}`, { indent: 10, size: 8 });
  y -= 10;
  drawLine();
  y -= 5;

  // ─── Signer Table ───
  drawText('SIGNERS', { font: boldFont, size: 12, color: rgb(0.1, 0.3, 0.6) });
  y -= 5;

  // Table header
  drawText('Name                  Email                     Status      Signed At                IP Address', {
    font: boldFont,
    size: 8,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 3;

  for (const signer of envelope.signers) {
    const row = [
      signer.name.padEnd(22),
      signer.email.padEnd(26),
      signer.status.padEnd(12),
      (signer.signedAt ?? 'N/A').padEnd(25),
      signer.ipAddress ?? 'N/A',
    ].join('');

    drawText(row, { size: 8 });

    // Show delegation chain if applicable
    if (signer.delegatedFrom) {
      drawText(
        `↳ Delegated from: ${signer.delegatedFrom.name} (${signer.delegatedFrom.email}) on ${signer.delegatedFrom.delegatedAt}`,
        { size: 7, color: rgb(0.4, 0.4, 0.4), indent: 10 },
      );
    }
  }

  y -= 10;

  // ─── Identity Verification (AES) ───
  const signersWithVerification = envelope.signers.filter((s) => s.identityVerification);
  if (signersWithVerification.length > 0) {
    drawLine();
    y -= 5;
    drawText('IDENTITY VERIFICATION', { font: boldFont, size: 12, color: rgb(0.1, 0.3, 0.6) });
    y -= 5;
    drawText('eIDAS Level: Advanced Electronic Signature (AES)', { size: 9, indent: 10, color: rgb(0.2, 0.5, 0.2) });
    y -= 3;

    for (const signer of signersWithVerification) {
      const iv = signer.identityVerification;
      if (!iv) continue;

      drawText(`${signer.name} (${signer.email})`, { font: boldFont, size: 9, indent: 10 });
      drawText(`Method: ${formatVerificationMethod(iv.method)}`, { size: 8, indent: 20 });
      drawText(`Provider: ${iv.provider}`, { size: 8, indent: 20 });
      drawText(`Verified At: ${iv.verifiedAt}`, { size: 8, indent: 20 });
      if (iv.details) {
        drawText(`Details: ${iv.details}`, { size: 8, indent: 20 });
      }
      y -= 3;
    }
    y -= 5;
  }

  // ─── QES Details ───
  const signersWithQES = envelope.signers.filter((s) => s.qesDetail);
  if (signersWithQES.length > 0) {
    drawLine();
    y -= 5;
    drawText('QUALIFIED ELECTRONIC SIGNATURES', { font: boldFont, size: 12, color: rgb(0.1, 0.3, 0.6) });
    y -= 5;
    drawText('eIDAS Level: Qualified Electronic Signature (QES)', { size: 9, indent: 10, color: rgb(0.1, 0.5, 0.1) });
    y -= 3;

    for (const signer of signersWithQES) {
      const qes = signer.qesDetail;
      if (!qes) continue;

      drawText(`${signer.name} (${signer.email})`, { font: boldFont, size: 9, indent: 10 });
      drawText(`Trust Service Provider: ${qes.tspName}`, { size: 8, indent: 20 });
      drawText(`Certificate Serial: ${qes.certificateSerial}`, { size: 8, indent: 20 });
      drawText(`QSCD Reference: ${qes.qscdReference}`, { size: 8, indent: 20 });
      drawText(`Signed At: ${qes.signedAt}`, { size: 8, indent: 20 });
      y -= 3;
    }
    y -= 5;
  }

  drawLine();
  y -= 5;

  // ─── Audit Trail ───
  drawText('AUDIT TRAIL', { font: boldFont, size: 12, color: rgb(0.1, 0.3, 0.6) });
  y -= 5;

  drawText('Timestamp                     Event Type            Signer             IP Address', {
    font: boldFont,
    size: 8,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 3;

  for (const event of envelope.auditTrail) {
    if (y < margin + 30) {
      newPage();
      drawText('AUDIT TRAIL (continued)', { font: boldFont, size: 12, color: rgb(0.1, 0.3, 0.6) });
      y -= 5;
    }

    const row = [
      event.timestamp.padEnd(30),
      event.eventType.padEnd(22),
      (event.signerName ?? 'System').padEnd(19),
      event.ipAddress ?? 'N/A',
    ].join('');

    drawText(row, { size: 8 });
  }

  // ─── Comments (Step 28) ───
  if (envelope.comments && envelope.comments.length > 0) {
    y -= 10;
    drawLine();
    y -= 5;
    drawText('COMMENTS', { font: boldFont, size: 12, color: rgb(0.1, 0.3, 0.6) });
    y -= 5;

    for (const comment of envelope.comments) {
      const resolvedTag = comment.resolved ? ' [RESOLVED]' : '';
      drawText(`${comment.authorName} (${comment.authorEmail}) — ${comment.createdAt}${resolvedTag}`, {
        font: boldFont,
        size: 8,
        indent: 5,
      });
      drawText(comment.content.substring(0, 300), { size: 8, indent: 10, color: rgb(0.3, 0.3, 0.3) });
      y -= 3;
    }
  }

  y -= 15;
  drawLine(2);
  y -= 5;

  // ─── Footer ───
  drawText('CoSeal v1.0.0 — Open Source E-Signature Engine', {
    size: 8,
    color: rgb(0.5, 0.5, 0.5),
  });
  drawText(`Generated: ${new Date().toISOString()}`, {
    size: 8,
    color: rgb(0.5, 0.5, 0.5),
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function formatVerificationMethod(method: string): string {
  switch (method) {
    case 'email_sms': return 'Two-Factor (Email + SMS OTP)';
    case 'government_id': return 'Government ID Verification';
    case 'bank_id': return 'Bank-Grade Identity';
    default: return method;
  }
}
