export interface BulkRecipient {
  name: string;
  email: string;
  [key: string]: string;
}

export interface BulkOptions {
  templateId: string;
  fieldMapping?: Record<string, string>;
  rateLimit?: number;
  notifyOnComplete?: string;
}

export interface BulkResult {
  created: number;
  failed: number;
  envelopeIds: string[];
  errors: Array<{ row: number; error: string }>;
  batchId: string;
}

export async function processBulkSend(
  templateId: string,
  recipients: BulkRecipient[],
  options?: BulkOptions
): Promise<BulkResult> {
  throw new Error('Not implemented: processBulkSend');
}

export async function getBulkSendStatus(batchId: string): Promise<{
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
}> {
  throw new Error('Not implemented: getBulkSendStatus');
}
