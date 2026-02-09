import type { FilledField } from './fieldTypes.js';
import { embedSignature, embedText, embedCheckbox, flattenFields } from './fieldPlacer.js';

/**
 * Apply all filled fields to the original PDF and produce the final document.
 * Called when all signers are done, before crypto sealing.
 */
export async function applyAllFields(
  pdfData: Buffer,
  filledFields: FilledField[],
): Promise<Buffer> {
  let currentPdf = pdfData;

  // Sort fields by page number for efficient processing
  const sorted = [...filledFields].sort((a, b) => a.page - b.page);

  for (const field of sorted) {
    const placement = {
      id: field.fieldId,
      type: field.type,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      required: true,
    };

    switch (field.type) {
      case 'signature':
      case 'initial':
        if (field.signatureImage) {
          currentPdf = await embedSignature(currentPdf, placement, field.signatureImage);
        } else if (field.value) {
          // Text-based signature/initial
          currentPdf = await embedText(currentPdf, placement, field.value);
        }
        break;

      case 'checkbox':
        currentPdf = await embedCheckbox(currentPdf, placement, field.value === 'true');
        break;

      case 'date':
      case 'text':
      case 'number':
      case 'currency':
      case 'calculated':
      case 'radio':
      case 'dropdown':
        if (field.value) {
          currentPdf = await embedText(currentPdf, placement, field.value);
        }
        break;

      case 'attachment':
        // Attachment fields embed an image from the uploaded file
        if (field.signatureImage) {
          currentPdf = await embedSignature(currentPdf, placement, field.signatureImage);
        }
        break;

      default:
        break;
    }
  }

  // Flatten to make everything permanent
  return flattenFields(currentPdf);
}
