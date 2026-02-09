import { PDFDocument } from 'pdf-lib';

export interface PageInfo {
  pageNumber: number;
  width: number;
  height: number;
}

/**
 * Parse a PDF buffer and extract basic info.
 */
export async function parsePdf(
  data: Buffer,
): Promise<{ pageCount: number; pages: PageInfo[] }> {
  const pdfDoc = await PDFDocument.load(data);
  const pages = pdfDoc.getPages();

  return {
    pageCount: pages.length,
    pages: pages.map((page, idx) => {
      const { width, height } = page.getSize();
      return { pageNumber: idx + 1, width, height };
    }),
  };
}

/**
 * Get PDF metadata.
 */
export async function getPdfMetadata(
  data: Buffer,
): Promise<Record<string, string>> {
  const pdfDoc = await PDFDocument.load(data);

  return {
    title: pdfDoc.getTitle() ?? '',
    author: pdfDoc.getAuthor() ?? '',
    subject: pdfDoc.getSubject() ?? '',
    creator: pdfDoc.getCreator() ?? '',
    producer: pdfDoc.getProducer() ?? '',
    creationDate: pdfDoc.getCreationDate()?.toISOString() ?? '',
    modificationDate: pdfDoc.getModificationDate()?.toISOString() ?? '',
    pageCount: String(pdfDoc.getPageCount()),
  };
}

/**
 * Render page as image (stub — in production the signing UI uses PDF.js client-side).
 * Returns the raw PDF page bytes for the specified page.
 */
export async function renderPageAsImage(
  data: Buffer,
  pageNum: number,
): Promise<Buffer> {
  // For the MVP, we return the PDF page as a separate single-page PDF.
  // The signing UI renders using PDF.js directly in the browser.
  const srcDoc = await PDFDocument.load(data);
  const pages = srcDoc.getPages();

  if (pageNum < 1 || pageNum > pages.length) {
    throw new Error(`Page ${pageNum} out of range (1-${pages.length})`);
  }

  const newDoc = await PDFDocument.create();
  const [copiedPage] = await newDoc.copyPages(srcDoc, [pageNum - 1]);
  newDoc.addPage(copiedPage);
  const pdfBytes = await newDoc.save();
  return Buffer.from(pdfBytes);
}
