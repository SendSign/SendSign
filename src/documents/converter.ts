import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';

const execFileAsync = promisify(execFile);

/** MIME types that are already PDF and need no conversion. */
const PDF_TYPES = new Set([
  'application/pdf',
]);

/** MIME types / extensions we know LibreOffice can convert to PDF. */
const CONVERTIBLE_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword',                                                      // .doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/vnd.ms-excel',                                                // .xls
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint',                                           // .ppt
  'application/vnd.oasis.opendocument.text',                                 // .odt
  'application/vnd.oasis.opendocument.spreadsheet',                          // .ods
  'application/rtf',                                                         // .rtf
  'text/plain',                                                              // .txt
]);

const CONVERTIBLE_EXTENSIONS = new Set([
  '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
  '.odt', '.ods', '.rtf', '.txt',
]);

export interface ConversionResult {
  /** The (possibly converted) file buffer. */
  buffer: Buffer;
  /** The filename — .pdf suffix if converted. */
  filename: string;
  /** The content type — application/pdf if converted. */
  contentType: string;
  /** Whether the file was converted from another format. */
  converted: boolean;
  /** If conversion was needed but failed, this contains the reason. */
  conversionError?: string;
}

/**
 * Check whether a file needs PDF conversion based on its MIME type and extension.
 */
export function needsConversion(mimetype: string, filename: string): boolean {
  if (PDF_TYPES.has(mimetype)) return false;
  if (filename.toLowerCase().endsWith('.pdf')) return false;

  const ext = path.extname(filename).toLowerCase();
  return CONVERTIBLE_TYPES.has(mimetype) || CONVERTIBLE_EXTENSIONS.has(ext);
}

/**
 * Check whether LibreOffice (soffice) is available on the system.
 * Caches the result after the first check.
 */
let _libreOfficeAvailable: boolean | null = null;
let _libreOfficePath: string | null = null;

async function findLibreOffice(): Promise<string | null> {
  if (_libreOfficeAvailable !== null) {
    return _libreOfficePath;
  }

  // Common paths for LibreOffice
  const candidates = [
    'soffice',
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',  // macOS
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',   // Windows
  ];

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 5000 });
      _libreOfficeAvailable = true;
      _libreOfficePath = candidate;
      console.log(`[converter] LibreOffice found at: ${candidate}`);
      return candidate;
    } catch {
      // Not found at this path, try next
    }
  }

  _libreOfficeAvailable = false;
  _libreOfficePath = null;
  console.warn('[converter] LibreOffice not found — DOCX→PDF conversion unavailable');
  return null;
}

/**
 * Convert a document buffer to PDF using LibreOffice headless mode.
 * Returns the PDF buffer on success, or null on failure.
 */
async function convertToPdfWithLibreOffice(
  inputBuffer: Buffer,
  originalFilename: string,
): Promise<Buffer | null> {
  const sofficePath = await findLibreOffice();
  if (!sofficePath) return null;

  // Create a unique temp directory for this conversion to avoid conflicts
  // when multiple conversions run concurrently
  const tmpDir = path.join(os.tmpdir(), `coseal-convert-${uuidv4()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const ext = path.extname(originalFilename) || '.docx';
  const inputPath = path.join(tmpDir, `input${ext}`);

  try {
    // Write the input file
    await fs.writeFile(inputPath, inputBuffer);

    // Run LibreOffice headless conversion
    await execFileAsync(
      sofficePath,
      [
        '--headless',
        '--norestore',
        '--convert-to', 'pdf',
        '--outdir', tmpDir,
        inputPath,
      ],
      {
        timeout: 60_000, // 60 second timeout for large documents
        env: {
          ...process.env,
          // Avoid LibreOffice lock file issues with concurrent conversions
          HOME: tmpDir,
        },
      },
    );

    // LibreOffice outputs the PDF with the same basename but .pdf extension
    const outputPath = path.join(tmpDir, `input.pdf`);

    try {
      const pdfBuffer = await fs.readFile(outputPath);
      return pdfBuffer;
    } catch {
      // Output file not found — conversion produced no output
      console.error(`[converter] LibreOffice produced no output for: ${originalFilename}`);
      return null;
    }
  } catch (err) {
    console.error(`[converter] LibreOffice conversion failed for ${originalFilename}:`, err);
    return null;
  } finally {
    // Clean up temp directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

/**
 * Ensure a file is in PDF format. If the input is already a PDF, returns it as-is.
 * If it's a convertible format (DOCX, DOC, etc.), attempts LibreOffice conversion.
 * If conversion is unavailable or fails, returns the original file with an error flag.
 */
export async function ensurePdf(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<ConversionResult> {
  // Already a PDF — pass through
  if (PDF_TYPES.has(mimetype) || filename.toLowerCase().endsWith('.pdf')) {
    return {
      buffer,
      filename,
      contentType: 'application/pdf',
      converted: false,
    };
  }

  // Not a known convertible type — store as-is with a warning
  if (!needsConversion(mimetype, filename)) {
    return {
      buffer,
      filename,
      contentType: mimetype,
      converted: false,
      conversionError: `Unsupported file type: ${mimetype}. PDF conversion required.`,
    };
  }

  // Attempt LibreOffice conversion
  const pdfBuffer = await convertToPdfWithLibreOffice(buffer, filename);

  if (pdfBuffer) {
    // Conversion succeeded
    const pdfFilename = filename.replace(/\.[^.]+$/, '.pdf');
    return {
      buffer: pdfBuffer,
      filename: pdfFilename,
      contentType: 'application/pdf',
      converted: true,
    };
  }

  // Conversion failed — store the raw file and flag the error
  return {
    buffer,
    filename,
    contentType: mimetype,
    converted: false,
    conversionError:
      'PDF conversion required — LibreOffice is not installed or conversion failed. ' +
      'Install LibreOffice to enable automatic DOCX→PDF conversion.',
  };
}
