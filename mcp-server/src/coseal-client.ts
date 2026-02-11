/**
 * CoSeal API Client
 *
 * Lightweight HTTP client for the CoSeal REST API.
 * Reads COSEAL_API_URL and COSEAL_API_KEY from environment.
 */

const API_URL = process.env.COSEAL_API_URL || 'http://localhost:3000';
const API_KEY = process.env.COSEAL_API_KEY || process.env.API_KEY || '';

if (!API_KEY) {
  console.error(
    'Warning: COSEAL_API_KEY is not set. API calls will fail authentication.',
  );
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  isMultipart?: boolean,
): Promise<ApiResponse<T>> {
  const url = `${API_URL}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
  };

  let fetchBody: BodyInit | undefined;

  if (isMultipart && body instanceof FormData) {
    // Let fetch set the Content-Type with boundary
    fetchBody = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: fetchBody,
  });

  const data = (await response.json()) as ApiResponse<T>;
  return data;
}

// ─── Envelope Types ─────────────────────────────────────────────────

export interface Signer {
  name: string;
  email: string;
  role?: string;
  order?: number;
}

export interface EnvelopeSummary {
  id: string;
  subject: string;
  status: string;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  completedAt: string | null;
  signers: Array<{
    id: string;
    name: string;
    email: string;
    status: string;
    signedAt: string | null;
  }>;
}

// ─── API Methods ────────────────────────────────────────────────────

/**
 * Create a new envelope with signers and optionally attach a PDF.
 */
export async function createEnvelope(params: {
  subject: string;
  message?: string;
  signingOrder?: 'sequential' | 'parallel';
  signers: Signer[];
  filePath?: string;
}): Promise<ApiResponse<EnvelopeSummary>> {
  const { subject, message, signingOrder, signers, filePath } = params;

  if (filePath) {
    // Multipart upload with document
    const fs = await import('node:fs');
    const path = await import('node:path');

    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append('subject', subject);
    if (message) formData.append('message', message);
    formData.append('signingOrder', signingOrder || 'sequential');
    formData.append('signers', JSON.stringify(signers));

    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('documents', blob, fileName);

    return request<EnvelopeSummary>('POST', '/api/envelopes', formData, true);
  } else {
    // JSON-only (no document attached)
    return request<EnvelopeSummary>('POST', '/api/envelopes', {
      subject,
      message,
      signingOrder: signingOrder || 'sequential',
      signers,
    });
  }
}

/**
 * Send an envelope to its signers (transitions from draft → sent).
 */
export async function sendEnvelope(
  envelopeId: string,
): Promise<ApiResponse> {
  return request('POST', `/api/envelopes/${envelopeId}/send`);
}

/**
 * Get the status and details of an envelope.
 */
export async function checkStatus(
  envelopeId: string,
): Promise<ApiResponse<EnvelopeSummary>> {
  return request<EnvelopeSummary>('GET', `/api/envelopes/${envelopeId}`);
}

/**
 * List recent envelopes with optional filters.
 */
export async function listEnvelopes(params?: {
  status?: string;
  limit?: number;
}): Promise<ApiResponse<{ envelopes: EnvelopeSummary[]; total: number }>> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const path = qs ? `/api/envelopes?${qs}` : '/api/envelopes';
  return request('GET', path);
}

/**
 * Void (cancel) an envelope.
 */
export async function voidEnvelope(
  envelopeId: string,
  reason?: string,
): Promise<ApiResponse> {
  return request('POST', `/api/envelopes/${envelopeId}/void`, { reason });
}
