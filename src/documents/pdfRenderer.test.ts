import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { parsePdf, getPdfMetadata, renderPageAsImage } from './pdfRenderer.js';

let testPdfBuffer: Buffer;

async function createTestPdf(pageCount: number = 2): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle('Test Document');
  doc.setAuthor('SendSign Test');
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([612, 792]); // US Letter
    page.drawText(`Page ${i + 1}`, {
      x: 50,
      y: 700,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

beforeAll(async () => {
  testPdfBuffer = await createTestPdf(3);
});

describe('parsePdf', () => {
  it('extracts page count and dimensions', async () => {
    const result = await parsePdf(testPdfBuffer);
    expect(result.pageCount).toBe(3);
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[0].width).toBe(612);
    expect(result.pages[0].height).toBe(792);
  });
});

describe('getPdfMetadata', () => {
  it('extracts metadata', async () => {
    const meta = await getPdfMetadata(testPdfBuffer);
    expect(meta.title).toBe('Test Document');
    expect(meta.author).toBe('SendSign Test');
    expect(meta.pageCount).toBe('3');
  });
});

describe('renderPageAsImage', () => {
  it('returns a single-page PDF for valid page', async () => {
    const result = await renderPageAsImage(testPdfBuffer, 2);
    const parsed = await parsePdf(result);
    expect(parsed.pageCount).toBe(1);
  });

  it('throws for invalid page number', async () => {
    await expect(renderPageAsImage(testPdfBuffer, 0)).rejects.toThrow('out of range');
    await expect(renderPageAsImage(testPdfBuffer, 99)).rejects.toThrow('out of range');
  });
});
