/**
 * SendSign API Client
 *
 * Lightweight HTTP client for the SendSign REST API.
 * Reads SENDSIGN_API_URL and SENDSIGN_API_KEY from environment.
 */

const API_URL = process.env.SENDSIGN_API_URL || 'http://localhost:3000';
const API_KEY = process.env.SENDSIGN_API_KEY || process.env.API_KEY || '';

if (!API_KEY) {
  console.error(
    'Warning: SENDSIGN_API_KEY is not set. API calls will fail authentication.',
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

/**
 * Download the signed/sealed document (returns URL to download).
 */
export async function downloadSigned(
  envelopeId: string,
): Promise<ApiResponse<{ url: string }>> {
  // Return the download URL rather than binary data (MCP tools return text)
  const baseUrl = API_URL;
  return {
    success: true,
    data: {
      url: `${baseUrl}/api/envelopes/${envelopeId}/signed-document`,
    },
  };
}

/**
 * Download the completion certificate (returns URL to download).
 */
export async function downloadCertificate(
  envelopeId: string,
): Promise<ApiResponse<{ url: string }>> {
  const baseUrl = API_URL;
  return {
    success: true,
    data: {
      url: `${baseUrl}/api/envelopes/${envelopeId}/certificate`,
    },
  };
}

/**
 * Send a reminder to pending signers.
 */
export async function sendReminder(
  envelopeId: string,
): Promise<ApiResponse<{ resent: number }>> {
  return request('POST', `/api/envelopes/${envelopeId}/resend`);
}

/**
 * Get audit trail for an envelope.
 */
export async function getAuditTrail(
  envelopeId: string,
): Promise<ApiResponse> {
  return request('GET', `/api/envelopes/${envelopeId}/audit`);
}

/**
 * Create a template.
 */
export async function createTemplate(params: {
  name: string;
  description?: string;
  signerRoles: Array<{ role: string; order: number }>;
}): Promise<ApiResponse> {
  return request('POST', '/api/templates', params);
}

/**
 * List templates.
 */
export async function listTemplates(): Promise<ApiResponse> {
  return request('GET', '/api/templates');
}

/**
 * Use a template to create an envelope.
 */
export async function useTemplate(
  templateId: string,
  signers: Array<{ name: string; email: string; role?: string }>,
): Promise<ApiResponse> {
  return request('POST', `/api/templates/${templateId}/use`, { signers });
}

/**
 * Bulk send envelopes.
 */
export async function bulkSend(params: {
  templateId: string;
  recipients: Array<{ name: string; email: string; mergeData?: Record<string, string> }>;
}): Promise<ApiResponse> {
  return request('POST', '/api/envelopes/bulk', params);
}

/**
 * Get analytics.
 */
export async function getAnalytics(
  period?: string,
): Promise<ApiResponse> {
  const query = period ? `?period=${encodeURIComponent(period)}` : '';
  return request('GET', `/api/admin/analytics${query}`);
}

/**
 * Get retention policies.
 */
export async function getRetentionPolicies(): Promise<ApiResponse> {
  return request('GET', '/api/retention/policies');
}

/**
 * Assign retention policy to an envelope.
 */
export async function assignRetention(
  envelopeId: string,
  policyId: string,
): Promise<ApiResponse> {
  return request('POST', `/api/envelopes/${envelopeId}/retention`, { policyId });
}

/**
 * Get expiring documents.
 */
export async function getExpiringDocuments(
  days?: number,
): Promise<ApiResponse> {
  const query = days ? `?days=${days}` : '';
  return request('GET', `/api/retention/expiring${query}`);
}

/**
 * Register a webhook.
 */
export async function registerWebhook(
  url: string,
  events: string[],
): Promise<ApiResponse> {
  return request('POST', '/api/webhooks', { url, events });
}

/**
 * List webhooks.
 */
export async function listWebhooks(): Promise<ApiResponse> {
  return request('GET', '/api/webhooks');
}

/**
 * Delete a webhook.
 */
export async function deleteWebhook(id: string): Promise<ApiResponse> {
  return request('DELETE', `/api/webhooks/${id}`);
}

/**
 * Create envelope from Legal plugin output — the handoff tool.
 * Accepts review context and auto-creates an envelope with sensible defaults.
 */
export async function createFromLegalReview(params: {
  subject: string;
  message?: string;
  parties: Array<{ name: string; email: string; role?: string }>;
  filePath?: string;
  reviewNotes?: string;
}): Promise<ApiResponse<EnvelopeSummary>> {
  const { subject, message, parties, filePath, reviewNotes } = params;

  // Build signers from parties
  const signers: Signer[] = parties.map((p, i) => ({
    name: p.name,
    email: p.email,
    role: p.role || 'signer',
    order: i + 1,
  }));

  // Create envelope with document if provided
  return createEnvelope({
    subject,
    message: message || (reviewNotes ? `Legal review notes: ${reviewNotes}` : undefined),
    signingOrder: 'sequential',
    signers,
    filePath,
  });
}
