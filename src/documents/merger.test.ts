import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { applyAllFields } from './merger.js';
import { parsePdf } from './pdfRenderer.js';
import type { FilledField } from './fieldTypes.js';

async function createTestPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Test Document for Merger', { x: 50, y: 700, size: 18, font, color: rgb(0, 0, 0) });
  return Buffer.from(await doc.save());
}

describe('applyAllFields', () => {
  it('applies text fields to a PDF', async () => {
    const pdf = await createTestPdf();
    const fields: FilledField[] = [
      { fieldId: 'f1', type: 'text', page: 1, x: 10, y: 50, width: 30, height: 5, value: 'John Doe' },
      { fieldId: 'f2', type: 'date', page: 1, x: 10, y: 60, width: 20, height: 4, value: '2024-01-15' },
    ];

    const result = await applyAllFields(pdf, fields);
    expect(result.length).toBeGreaterThan(0);
    const parsed = await parsePdf(result);
    expect(parsed.pageCount).toBe(1);
  });

  it('applies checkbox fields', async () => {
    const pdf = await createTestPdf();
    const fields: FilledField[] = [
      { fieldId: 'f1', type: 'checkbox', page: 1, x: 10, y: 80, width: 3, height: 3, value: 'true' },
      { fieldId: 'f2', type: 'checkbox', page: 1, x: 15, y: 80, width: 3, height: 3, value: 'false' },
    ];

    const result = await applyAllFields(pdf, fields);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles empty field list', async () => {
    const pdf = await createTestPdf();
    const result = await applyAllFields(pdf, []);
    expect(result.length).toBeGreaterThan(0);
    const parsed = await parsePdf(result);
    expect(parsed.pageCount).toBe(1);
  });
});
