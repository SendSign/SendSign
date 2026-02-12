/**
 * SendSign SDK client.
 * @module @sendsign/sdk
 */

import type {
  SendSignConfig,
  CreateEnvelopeInput,
  Envelope,
  EnvelopeFilters,
  EnvelopeList,
  CreateTemplateInput,
  Template,
  SignerInput,
  Webhook,
  WebhookEvent,
  AuditEvent,
  EmbedOptions,
  ApiResponse,
} from './types.js';

import {
  SendSignError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
  TimeoutError,
  NetworkError,
} from './errors.js';

/**
 * Main SendSign SDK client.
 *
 * @example
 * ```typescript
 * import { SendSignClient } from '@sendsign/sdk';
 *
 * const sendsign = new SendSignClient({
 *   baseUrl: 'https://sign.yourcompany.com',
 *   apiKey: 'your-api-key',
 * });
 *
 * const envelope = await sendsign.createEnvelope({
 *   document: fs.readFileSync('contract.pdf'),
 *   subject: 'Please sign the MSA',
 *   signers: [
 *     { email: 'alice@company.com', name: 'Alice', order: 1 },
 *   ],
 * });
 *
 * await sendsign.sendEnvelope(envelope.id);
 * ```
 */
export class SendSignClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: SendSignConfig) {
    if (!config.baseUrl) throw new Error('baseUrl is required');
    if (!config.apiKey) throw new Error('apiKey is required');

    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // ─── Envelope Management ──────────────────────────────────────────

  /**
   * Create a new envelope with a document and signers.
   */
  async createEnvelope(input: CreateEnvelopeInput): Promise<Envelope> {
    const formData = new FormData();
    formData.append('subject', input.subject);
    if (input.message) formData.append('message', input.message);
    if (input.signingOrder) formData.append('signingOrder', input.signingOrder);
    formData.append('signers', JSON.stringify(input.signers));
    if (input.fields) formData.append('fields', JSON.stringify(input.fields));
    if (input.retentionPolicyId) formData.append('retentionPolicyId', input.retentionPolicyId);

    // Handle document
    if (input.document instanceof Blob) {
      formData.append('documents', input.document, input.filename ?? 'document.pdf');
    } else if (Buffer.isBuffer(input.document)) {
      const uint8 = new Uint8Array(input.document);
      const blob = new Blob([uint8], { type: 'application/pdf' });
      formData.append('documents', blob, input.filename ?? 'document.pdf');
    } else if (typeof input.document === 'string') {
      // Base64 string
      const binary = atob(input.document);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      formData.append('documents', blob, input.filename ?? 'document.pdf');
    }

    return this.requestMultipart<Envelope>('POST', '/api/envelopes', formData);
  }

  /**
   * Send an envelope for signing.
   */
  async sendEnvelope(id: string): Promise<void> {
    await this.request<void>('POST', `/api/envelopes/${id}/send`);
  }

  /**
   * Get an envelope by ID.
   */
  async getEnvelope(id: string): Promise<Envelope> {
    return this.request<Envelope>('GET', `/api/envelopes/${id}`);
  }

  /**
   * List envelopes with optional filters.
   */
  async listEnvelopes(filters?: EnvelopeFilters): Promise<EnvelopeList> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.sortBy) params.set('sortBy', filters.sortBy);
    if (filters?.sortOrder) params.set('sortOrder', filters.sortOrder);

    const qs = params.toString();
    return this.request<EnvelopeList>('GET', `/api/envelopes${qs ? `?${qs}` : ''}`);
  }

  /**
   * Void an envelope (cancel it).
   */
  async voidEnvelope(id: string, reason?: string): Promise<void> {
    await this.request<void>('POST', `/api/envelopes/${id}/void`, { reason });
  }

  // ─── Signing ──────────────────────────────────────────────────────

  /**
   * Get the signing URL for a specific signer.
   */
  async getSigningUrl(envelopeId: string, signerId: string): Promise<string> {
    const envelope = await this.getEnvelope(envelopeId);
    const signer = envelope.signers.find((s) => s.id === signerId);
    if (!signer) throw new NotFoundError('Signer', signerId);
    if (!signer.signingToken) throw new SendSignError('Signer does not have a signing token. Send the envelope first.', 'NO_TOKEN');
    return `${this.baseUrl}/sign/${signer.signingToken}`;
  }

  // ─── Documents ────────────────────────────────────────────────────

  /**
   * Download the sealed (signed) document.
   */
  async downloadSealed(envelopeId: string): Promise<Buffer> {
    return this.requestBinary('GET', `/api/envelopes/${envelopeId}/sealed`);
  }

  /**
   * Download the completion certificate.
   */
  async downloadCertificate(envelopeId: string): Promise<Buffer> {
    return this.requestBinary('GET', `/api/envelopes/${envelopeId}/certificate`);
  }

  // ─── Templates ────────────────────────────────────────────────────

  /**
   * Create a new template.
   */
  async createTemplate(input: CreateTemplateInput): Promise<Template> {
    const formData = new FormData();
    formData.append('name', input.name);
    if (input.description) formData.append('description', input.description);
    formData.append('roles', JSON.stringify(input.roles));
    if (input.fields) formData.append('fields', JSON.stringify(input.fields));

    if (input.document instanceof Blob) {
      formData.append('document', input.document, 'template.pdf');
    } else if (Buffer.isBuffer(input.document)) {
      const uint8 = new Uint8Array(input.document);
      const blob = new Blob([uint8], { type: 'application/pdf' });
      formData.append('document', blob, 'template.pdf');
    }

    return this.requestMultipart<Template>('POST', '/api/templates', formData);
  }

  /**
   * Use a template to create a new envelope.
   */
  async useTemplate(templateId: string, signers: SignerInput[]): Promise<Envelope> {
    return this.request<Envelope>('POST', `/api/templates/${templateId}/use`, { signers });
  }

  // ─── Reminders ──────────────────────────────────────────────────

  /**
   * Send reminders to pending signers. Regenerates expired tokens.
   */
  async sendReminder(envelopeId: string): Promise<{ resent: number }> {
    return this.request<{ resent: number }>('POST', `/api/envelopes/${envelopeId}/resend`);
  }

  // ─── Bulk Operations ───────────────────────────────────────────

  /**
   * Bulk send envelopes using a template and recipient list.
   */
  async bulkSend(params: {
    templateId: string;
    recipients: Array<{ name: string; email: string; mergeData?: Record<string, string> }>;
  }): Promise<{ batchId: string; created: number; failed: number }> {
    return this.request<{ batchId: string; created: number; failed: number }>('POST', '/api/envelopes/bulk', params);
  }

  /**
   * Check the status of a bulk send batch.
   */
  async getBulkStatus(batchId: string): Promise<{ total: number; sent: number; failed: number; envelopes: Array<{ id: string; status: string }> }> {
    return this.request('GET', `/api/envelopes/bulk/${batchId}/status`);
  }

  /**
   * Generate an envelope from a template with merge data.
   */
  async generateFromTemplate(params: {
    templateId: string;
    mergeData: Record<string, string>;
    signers: SignerInput[];
  }): Promise<Envelope> {
    return this.request<Envelope>('POST', '/api/envelopes/generate', params);
  }

  // ─── Auto-placement ────────────────────────────────────────────

  /**
   * Automatically place signature fields on a document.
   * Designed for AI/programmatic use.
   */
  async autoPlaceFields(envelopeId: string): Promise<{ fieldsPlaced: number; page: number }> {
    return this.request<{ fieldsPlaced: number; page: number }>('POST', `/api/envelopes/${envelopeId}/auto-place-fields`);
  }

  // ─── Analytics ─────────────────────────────────────────────────

  /**
   * Get signing analytics and statistics.
   */
  async getAnalytics(period?: string): Promise<Record<string, unknown>> {
    const query = period ? `?period=${encodeURIComponent(period)}` : '';
    return this.request<Record<string, unknown>>('GET', `/api/admin/analytics${query}`);
  }

  // ─── Audit ────────────────────────────────────────────────────────

  /**
   * Get the audit trail for an envelope.
   */
  async getAuditTrail(envelopeId: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    if (format === 'csv') {
      const response = await this.rawRequest('GET', `/api/envelopes/${envelopeId}/audit?format=csv`);
      return response.text();
    }

    const events = await this.request<AuditEvent[]>('GET', `/api/envelopes/${envelopeId}/audit`);
    return JSON.stringify(events, null, 2);
  }

  // ─── Retention ────────────────────────────────────────────────────

  /**
   * Assign a retention policy to an envelope.
   */
  async assignRetentionPolicy(envelopeId: string, policyId: string): Promise<void> {
    await this.request<void>('POST', `/api/envelopes/${envelopeId}/retention`, { policyId });
  }

  // ─── Webhooks ─────────────────────────────────────────────────────

  /**
   * Register a webhook.
   */
  async registerWebhook(url: string, events: WebhookEvent[]): Promise<Webhook> {
    return this.request<Webhook>('POST', '/api/webhooks', { url, events });
  }

  /**
   * List registered webhooks.
   */
  async listWebhooks(): Promise<Webhook[]> {
    return this.request<Webhook[]>('GET', '/api/webhooks');
  }

  /**
   * Delete a webhook.
   */
  async deleteWebhook(id: string): Promise<void> {
    await this.request<void>('DELETE', `/api/webhooks/${id}`);
  }

  // ─── Embed ────────────────────────────────────────────────────────

  /**
   * Embed the signing UI in a container element.
   *
   * @example
   * ```typescript
   * sendsign.embedSigning({
   *   containerId: 'signing-container',
   *   token: 'abc123',
   *   onSigned: (data) => console.log('Signed!', data),
   *   onError: (err) => console.error('Error:', err),
   * });
   * ```
   */
  embedSigning(options: EmbedOptions): { destroy: () => void } {
    const container = document.getElementById(options.containerId);
    if (!container) {
      throw new Error(`Container element not found: ${options.containerId}`);
    }

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.src = `${this.baseUrl}/sign/${options.token}`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.allow = 'camera'; // For signature upload via camera

    // Apply custom styles
    if (options.style) {
      Object.assign(iframe.style, options.style);
    }

    // Listen for postMessage events from the signing UI
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== this.baseUrl) return;

      const { type, data } = event.data ?? {};

      switch (type) {
        case 'sendsign:ready':
          options.onReady?.();
          break;
        case 'sendsign:signed':
          options.onSigned?.(data);
          break;
        case 'sendsign:declined':
          options.onDeclined?.(data);
          break;
        case 'sendsign:error':
          options.onError?.(new SendSignError(data.message, 'EMBED_ERROR'));
          break;
      }
    };

    window.addEventListener('message', messageHandler);

    // Notify when iframe loads
    iframe.onload = () => {
      options.onReady?.();
    };

    container.innerHTML = '';
    container.appendChild(iframe);

    // Return destroy function
    return {
      destroy: () => {
        window.removeEventListener('message', messageHandler);
        iframe.remove();
      },
    };
  }

  // ─── HTTP Helpers ─────────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.rawRequest(method, path, body);
    const json: ApiResponse<T> = await response.json();

    if (!json.success) {
      throw new SendSignError(json.error ?? 'Unknown error', 'API_ERROR', response.status);
    }

    return json.data as T;
  }

  private async requestMultipart<T>(method: string, path: string, formData: FormData): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.handleHttpErrors(response);

      const json: ApiResponse<T> = await response.json();
      if (!json.success) {
        throw new SendSignError(json.error ?? 'Unknown error', 'API_ERROR', response.status);
      }

      return json.data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof SendSignError) throw error;
      if ((error as Error).name === 'AbortError') throw new TimeoutError(this.timeout);
      throw new NetworkError((error as Error).message);
    }
  }

  private async requestBinary(method: string, path: string): Promise<Buffer> {
    const response = await this.rawRequest(method, path);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async rawRequest(method: string, path: string, body?: unknown): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.handleHttpErrors(response);

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof SendSignError) throw error;
      if ((error as Error).name === 'AbortError') throw new TimeoutError(this.timeout);
      throw new NetworkError((error as Error).message);
    }
  }

  private handleHttpErrors(response: Response): void {
    if (response.ok) return;

    switch (response.status) {
      case 401:
        throw new AuthenticationError();
      case 404:
        throw new NotFoundError('Resource', response.url);
      case 400:
        throw new ValidationError('Invalid request');
      case 429: {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '', 10);
        throw new RateLimitError(isNaN(retryAfter) ? undefined : retryAfter);
      }
      case 500:
      case 502:
      case 503:
        throw new ServerError();
      default:
        throw new SendSignError(`HTTP ${response.status}: ${response.statusText}`, 'HTTP_ERROR', response.status);
    }
  }
}
