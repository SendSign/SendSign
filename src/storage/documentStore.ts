import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt, pack, unpack, deriveKey } from './encryption.js';

export interface UploadMetadata {
  filename?: string;
  contentType?: string;
  envelopeId?: string;
  [key: string]: string | undefined;
}

let s3Client: S3Client | undefined;

function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return s3Client;
}

function getBucket(): string {
  return process.env.S3_BUCKET ?? 'coseal-documents';
}

// Cache the derived key so we get the same key for upload and download
let _encryptionKey: Buffer | undefined;

function getEncryptionKey(): Buffer {
  if (_encryptionKey) return _encryptionKey;
  const keyStr = process.env.ENCRYPTION_KEY ?? '';
  if (keyStr.length < 16) {
    throw new Error('ENCRYPTION_KEY must be at least 16 characters');
  }
  // Use a fixed, deterministic salt derived from the key itself
  // This ensures the same passphrase always produces the same encryption key
  const fixedSalt = Buffer.from('coseal-document-encryption-salt!');
  _encryptionKey = deriveKey(keyStr, fixedSalt).key;
  return _encryptionKey;
}

/**
 * Encrypt and upload a document to S3-compatible storage.
 * Returns the storage key.
 */
export async function uploadDocument(
  data: Buffer,
  metadata?: UploadMetadata,
): Promise<string> {
  const key = `documents/${uuidv4()}`;
  const encKey = getEncryptionKey();

  // Encrypt the document
  const encResult = await encrypt(data, encKey);
  const packed = pack(encResult);

  // Build S3 metadata (only string values)
  const s3Meta: Record<string, string> = {};
  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      if (v !== undefined) s3Meta[k] = v;
    }
  }

  await getS3().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: packed,
      ContentType: 'application/octet-stream',
      Metadata: s3Meta,
    }),
  );

  return key;
}

/**
 * Download and decrypt a document from S3-compatible storage.
 */
export async function downloadDocument(key: string): Promise<Buffer> {
  const response = await getS3().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );

  const bodyBytes = await response.Body?.transformToByteArray();
  if (!bodyBytes) throw new Error(`Empty response for key: ${key}`);

  const packed = Buffer.from(bodyBytes);
  const { encrypted, iv, tag } = unpack(packed);
  const encKey = getEncryptionKey();

  return decrypt(encrypted, encKey, iv, tag);
}

/**
 * Delete a document from S3-compatible storage.
 */
export async function deleteDocument(key: string): Promise<void> {
  await getS3().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
  );
}

/**
 * Generate a pre-signed URL for direct browser access.
 */
export async function getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key });
  return s3GetSignedUrl(getS3(), command, { expiresIn });
}
