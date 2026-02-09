import { PDFDocument } from 'pdf-lib';
import type { AnchorMatch, AnchorFieldConfig, FieldPlacement } from './fieldTypes.js';

/**
 * Scan PDF text layer for anchor strings and return their positions.
 *
 * Note: pdf-lib does not have built-in text extraction. For a full implementation,
 * you'd use PDF.js or a server-side PDF text extraction library.
 * This implementation extracts text from content streams as a best-effort approach.
 */
export async function findAnchorPositions(
  pdfData: Buffer,
  anchorText: string,
): Promise<AnchorMatch[]> {
  const matches: AnchorMatch[] = [];
  const pdfDoc = await PDFDocument.load(pdfData);
  const pages = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();

    // Extract text operators from the content stream
    // This is a simplified approach - production would use PDF.js
    const textContent = extractTextFromPage(page);

    let searchStart = 0;
    while (true) {
      const pos = textContent.text.indexOf(anchorText, searchStart);
      if (pos === -1) break;

      // Find the approximate position based on character position ratio
      const ratio = pos / Math.max(textContent.text.length, 1);
      matches.push({
        anchor: anchorText,
        page: i + 1,
        // Convert to percentage coordinates
        x: Math.min((ratio * 100) % 80, 80), // rough horizontal position
        y: (Math.floor(ratio * 10) * 10) % 90, // rough vertical position
      });

      searchStart = pos + anchorText.length;
    }
  }

  return matches;
}

/**
 * Best-effort text extraction from a PDF page.
 * Extracts string literals from the PDF page content stream.
 */
function extractTextFromPage(page: ReturnType<PDFDocument['getPages']>[0]): { text: string } {
  try {
    // Access the raw content stream to find text operators
    const node = page.node;
    const contents = node.Contents();

    if (!contents) return { text: '' };

    // Try to decode content stream bytes
    let rawText = '';
    const ref = contents.toString();
    // This is a simplified extraction — real implementation would parse operators
    // For anchor tag matching, we look for text between parentheses (Tj/TJ operators)
    const parenRegex = /\(([^)]*)\)/g;
    let match;
    while ((match = parenRegex.exec(ref)) !== null) {
      rawText += match[1];
    }

    return { text: rawText };
  } catch {
    return { text: '' };
  }
}

/**
 * Given anchor text → field type mappings, automatically generate field placements
 * at the positions where anchor text is found.
 */
export async function autoPlaceFields(
  pdfData: Buffer,
  anchorConfig: AnchorFieldConfig[],
): Promise<FieldPlacement[]> {
  const placements: FieldPlacement[] = [];
  let fieldIndex = 0;

  for (const config of anchorConfig) {
    const positions = await findAnchorPositions(pdfData, config.anchor);

    for (const pos of positions) {
      placements.push({
        id: `anchor-field-${fieldIndex++}`,
        type: config.fieldType,
        page: pos.page,
        x: pos.x + config.offsetX,
        y: pos.y + config.offsetY,
        width: config.width,
        height: config.height,
        signerId: config.signerId,
        required: config.required ?? true,
        label: config.anchor,
      });
    }
  }

  return placements;
}
