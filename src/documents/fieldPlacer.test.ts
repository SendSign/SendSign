import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { placeFields, embedText, flattenFields } from './fieldPlacer.js';
import { parsePdf } from './pdfRenderer.js';
import type { FieldPlacement } from './fieldTypes.js';

async function createTestPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Test Document', { x: 50, y: 700, size: 18, font, color: rgb(0, 0, 0) });
  return Buffer.from(await doc.save());
}

describe('placeFields', () => {
  it('places field indicators on a PDF', async () => {
    const pdf = await createTestPdf();
    const fields: FieldPlacement[] = [
      { id: 'f1', type: 'signature', page: 1, x: 10, y: 80, width: 25, height: 6, required: true, label: 'Sign Here' },
      { id: 'f2', type: 'date', page: 1, x: 40, y: 80, width: 20, height: 4, required: true, label: 'Date' },
    ];

    const result = await placeFields(pdf, fields);
    expect(result.length).toBeGreaterThan(0);
    const parsed = await parsePdf(result);
    expect(parsed.pageCount).toBe(1);
  });

  it('skips fields with invalid page numbers', async () => {
    const pdf = await createTestPdf();
    const fields: FieldPlacement[] = [
      { id: 'f1', type: 'text', page: 99, x: 10, y: 10, width: 20, height: 4, required: false },
    ];

    const result = await placeFields(pdf, fields);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('embedText', () => {
  it('embeds text at the specified position', async () => {
    const pdf = await createTestPdf();
    const field: FieldPlacement = {
      id: 'f1',
      type: 'text',
      page: 1,
      x: 10,
      y: 50,
      width: 30,
      height: 5,
      required: true,
    };

    const result = await embedText(pdf, field, 'Embedded Text Value');
    expect(result.length).toBeGreaterThan(0);
    const parsed = await parsePdf(result);
    expect(parsed.pageCount).toBe(1);
  });
});

describe('flattenFields', () => {
  it('returns a valid PDF', async () => {
    const pdf = await createTestPdf();
    const result = await flattenFields(pdf);
    expect(result.length).toBeGreaterThan(0);
    const parsed = await parsePdf(result);
    expect(parsed.pageCount).toBe(1);
  });
});
