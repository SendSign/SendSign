export type SignatureType = 'drawn' | 'typed' | 'uploaded';

export interface SignatureData {
  type: SignatureType;
  data: string | Buffer;
  width: number;
  height: number;
}

export async function processDrawnSignature(dataUrl: string): Promise<Buffer> {
  throw new Error('Not implemented: processDrawnSignature');
}

export async function processTypedSignature(
  name: string,
  fontFamily?: string
): Promise<Buffer> {
  throw new Error('Not implemented: processTypedSignature');
}

export async function processUploadedSignature(imageData: Buffer): Promise<Buffer> {
  throw new Error('Not implemented: processUploadedSignature');
}

export async function validateSignatureImage(imageData: Buffer): Promise<boolean> {
  throw new Error('Not implemented: validateSignatureImage');
}
