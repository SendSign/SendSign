import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { downloadDocument, uploadDocument } from '../storage/documentStore.js';
import { getDb } from '../db/connection.js';
import { envelopes, signers, fields as fieldsTable } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Seal the PDF by flattening all field values into the document.
 * This creates a final, immutable signed document.
 */
export async function sealPdfDocument(envelopeId: string): Promise<string> {
  const db = getDb();

  // Get envelope
  const [envelope] = await db.select().from(envelopes).where(eq(envelopes.id, envelopeId)).limit(1);
  if (!envelope || !envelope.documentKey) {
    throw new Error('Envelope or document not found');
  }

  // Get all fields with values
  const allFields = await db.select().from(fieldsTable).where(eq(fieldsTable.envelopeId, envelopeId));

  // Get all signers
  const allSigners = await db.select().from(signers).where(eq(signers.envelopeId, envelopeId));

  // Load the original PDF
  const originalPdfBuffer = await downloadDocument(envelope.documentKey);
  const pdfDoc = await PDFDocument.load(originalPdfBuffer);
  const pages = pdfDoc.getPages();

  // Embed font for text rendering
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Process each field and embed its value into the PDF
  for (const field of allFields) {
    if (!field.value) continue; // Skip empty fields

    const page = pages[field.page - 1]; // Pages are 1-indexed in our schema
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();

    // Convert percentage-based coordinates to absolute pixels
    const x = (field.x / 100) * pageWidth;
    const y = pageHeight - (field.y / 100) * pageHeight; // PDF coordinates are bottom-up
    const w = (field.width / 100) * pageWidth;
    const h = (field.height / 100) * pageHeight;

    try {
      if (field.type === 'signature' || field.type === 'initial') {
        // Signature/initial fields contain base64 image data
        if (field.value.startsWith('data:image')) {
          const base64Data = field.value.split(',')[1];
          const imageBytes = Buffer.from(base64Data, 'base64');

          // Determine image type and embed
          let image;
          if (field.value.includes('image/png')) {
            image = await pdfDoc.embedPng(imageBytes);
          } else if (field.value.includes('image/jpeg') || field.value.includes('image/jpg')) {
            image = await pdfDoc.embedJpg(imageBytes);
          } else {
            // Fallback: try PNG
            try {
              image = await pdfDoc.embedPng(imageBytes);
            } catch {
              console.warn(`Failed to embed signature image for field ${field.id}`);
              continue;
            }
          }

          // Scale image to fit field bounds
          const imgDims = image.scale(1);
          const scale = Math.min(w / imgDims.width, h / imgDims.height);

          page.drawImage(image, {
            x,
            y: y - h, // Adjust for bottom-up coordinates
            width: imgDims.width * scale,
            height: imgDims.height * scale,
          });
        }
      } else if (field.type === 'checkbox') {
        // Draw checkbox
        const checked = field.value === 'true' || field.value === 'on';
        const boxSize = Math.min(w, h);

        // Draw checkbox border
        page.drawRectangle({
          x,
          y: y - boxSize,
          width: boxSize,
          height: boxSize,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1,
        });

        // Draw checkmark if checked
        if (checked) {
          page.drawText('✓', {
            x: x + 2,
            y: y - boxSize + 4,
            size: boxSize * 0.8,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
        }
      } else {
        // Text fields (date, text, name, email, etc.)
        const fontSize = Math.min(h * 0.6, 12);
        const textY = y - h / 2 - fontSize / 3; // Center vertically

        page.drawText(field.value, {
          x: x + 2,
          y: textY,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
          maxWidth: w - 4,
        });
      }
    } catch (err) {
      console.error(`Failed to render field ${field.id}:`, err);
      // Continue processing other fields
    }
  }

  // Add a seal/watermark on the last page
  const lastPage = pages[pages.length - 1];
  const { height: lastPageHeight } = lastPage.getSize();

  lastPage.drawText('Digitally Signed Document', {
    x: 40,
    y: lastPageHeight - 30,
    size: 8,
    font: boldFont,
    color: rgb(0.3, 0.3, 0.3),
  });

  lastPage.drawText(`Sealed on ${new Date().toISOString()}`, {
    x: 40,
    y: lastPageHeight - 42,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Serialize the sealed PDF
  const sealedPdfBytes = await pdfDoc.save();

  // Upload to storage
  const sealedKey = await uploadDocument(Buffer.from(sealedPdfBytes), {
    filename: `sealed_${envelope.id}.pdf`,
    contentType: 'application/pdf',
    envelopeId,
  });

  // Update envelope with sealed key
  await db.update(envelopes).set({ sealedKey, updatedAt: new Date() }).where(eq(envelopes.id, envelopeId));

  return sealedKey;
}
