import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import type { FieldPlacement, FilledField } from './fieldTypes.js';

/**
 * Convert percentage coordinates to absolute PDF coordinates.
 * PDF coordinates have origin at bottom-left.
 */
function toAbsolute(
  field: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: (field.x / 100) * pageWidth,
    // PDF y=0 is at bottom, but we define y from top
    y: pageHeight - ((field.y / 100) * pageHeight) - ((field.height / 100) * pageHeight),
    width: (field.width / 100) * pageWidth,
    height: (field.height / 100) * pageHeight,
  };
}

/**
 * Place visual field indicators (dotted boxes, labels) onto the PDF.
 * Used for the signing UI to show where signers need to fill in.
 */
export async function placeFields(
  pdfData: Buffer,
  fields: FieldPlacement[],
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfData);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    const pageIdx = field.page - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;

    const page = pages[pageIdx];
    const { width: pw, height: ph } = page.getSize();
    const abs = toAbsolute(field, pw, ph);

    drawFieldBox(page, abs, field, font);
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

function drawFieldBox(
  page: PDFPage,
  abs: { x: number; y: number; width: number; height: number },
  field: FieldPlacement,
  font: PDFFont,
): void {
  // Draw a dashed rectangle border
  const color = rgb(0.2, 0.4, 0.8); // blue
  const fillColor = rgb(0.9, 0.93, 1.0); // light blue background

  page.drawRectangle({
    x: abs.x,
    y: abs.y,
    width: abs.width,
    height: abs.height,
    borderColor: color,
    borderWidth: 1,
    color: fillColor,
    opacity: 0.3,
    borderOpacity: 0.8,
  });

  // Draw label
  const label = field.label ?? field.type.toUpperCase();
  const fontSize = Math.min(10, abs.height * 0.6);
  page.drawText(label, {
    x: abs.x + 2,
    y: abs.y + abs.height / 2 - fontSize / 3,
    size: fontSize,
    font,
    color,
    opacity: 0.7,
  });
}

/**
 * Permanently embed a signature image at the specified position.
 */
export async function embedSignature(
  pdfData: Buffer,
  field: FieldPlacement,
  signatureImage: Buffer,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfData);
  const pages = pdfDoc.getPages();
  const pageIdx = field.page - 1;

  if (pageIdx < 0 || pageIdx >= pages.length) {
    throw new Error(`Page ${field.page} out of range`);
  }

  const page = pages[pageIdx];
  const { width: pw, height: ph } = page.getSize();
  const abs = toAbsolute(field, pw, ph);

  // Try to embed as PNG first, fall back to JPEG
  let image;
  try {
    image = await pdfDoc.embedPng(signatureImage);
  } catch {
    image = await pdfDoc.embedJpg(signatureImage);
  }

  page.drawImage(image, {
    x: abs.x,
    y: abs.y,
    width: abs.width,
    height: abs.height,
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/**
 * Embed text (date, text, initials) at a field position.
 */
export async function embedText(
  pdfData: Buffer,
  field: FieldPlacement,
  text: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfData);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const pageIdx = field.page - 1;

  if (pageIdx < 0 || pageIdx >= pages.length) {
    throw new Error(`Page ${field.page} out of range`);
  }

  const page = pages[pageIdx];
  const { width: pw, height: ph } = page.getSize();
  const abs = toAbsolute(field, pw, ph);

  const fontSize = Math.min(12, abs.height * 0.7);
  page.drawText(text, {
    x: abs.x + 2,
    y: abs.y + abs.height / 2 - fontSize / 3,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/**
 * Embed a checkbox mark at the field position.
 */
export async function embedCheckbox(
  pdfData: Buffer,
  field: FieldPlacement,
  checked: boolean,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfData);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const pageIdx = field.page - 1;

  if (pageIdx < 0 || pageIdx >= pages.length) {
    throw new Error(`Page ${field.page} out of range`);
  }

  const page = pages[pageIdx];
  const { width: pw, height: ph } = page.getSize();
  const abs = toAbsolute(field, pw, ph);

  // Draw checkbox border
  page.drawRectangle({
    x: abs.x,
    y: abs.y,
    width: abs.width,
    height: abs.height,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  // Draw checkmark if checked
  if (checked) {
    const fontSize = Math.min(14, abs.height * 0.8);
    page.drawText('X', {
      x: abs.x + abs.width * 0.15,
      y: abs.y + abs.height * 0.15,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/**
 * Flatten all embedded content (make not editable).
 * pdf-lib content is inherently "flattened" (it draws directly on the page),
 * so this is effectively a no-op pass-through that ensures the PDF is valid.
 */
export async function flattenFields(pdfData: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfData);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
