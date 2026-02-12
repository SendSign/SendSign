/**
 * SendSign SDK TypeScript types.
 * @module @sendsign/sdk
 */

// ─── Configuration ──────────────────────────────────────────────────

export interface SendSignConfig {
  /** Base URL of the SendSign API (e.g., "https://sign.yourcompany.com") */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Custom fetch implementation (for testing or Node.js) */
  fetch?: typeof fetch;
}

// ─── Envelopes ──────────────────────────────────────────────────────

export interface CreateEnvelopeInput {
  /** Document file as Buffer, Blob, or base64 string */
  document: Buffer | Blob | string;
  /** Document filename */
  filename?: string;
  /** Envelope subject line */
  subject: string;
  /** Optional message to signers */
  message?: string;
  /** Signing order: "sequential" or "parallel" */
  signingOrder?: 'sequential' | 'parallel';
  /** Signers who need to sign */
  signers: SignerInput[];
  /** Signature and form fields */
  fields?: FieldInput[];
  /** Optional retention policy ID to assign */
  retentionPolicyId?: string;
}

export interface SignerInput {
  /** Signer's full name */
  name: string;
  /** Signer's email address */
  email: string;
  /** Signing order (1-based, for sequential signing) */
  order?: number;
  /** Identity verification level */
  verificationLevel?: 'simple' | 'advanced' | 'qualified';
}

export interface FieldInput {
  /** Field type */
  type: FieldType;
  /** Page number (1-based) */
  page: number;
  /** X position as percentage (0-100) */
  x: number;
  /** Y position as percentage (0-100) */
  y: number;
  /** Width as percentage (0-100) */
  width: number;
  /** Height as percentage (0-100) */
  height: number;
  /** Index of the signer this field belongs to (0-based into signers array) */
  signerId: number;
  /** Field label */
  label?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Options for radio/dropdown fields */
  options?: string[];
}

export type FieldType =
  | 'signature'
  | 'initial'
  | 'date'
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'number'
  | 'currency'
  | 'calculated'
  | 'attachment';

// ─── Envelope Response ──────────────────────────────────────────────

export interface Envelope {
  id: string;
  subject: string;
  message: string | null;
  status: EnvelopeStatus;
  signingOrder: 'sequential' | 'parallel';
  signers: Signer[];
  fields: Field[];
  createdAt: string;
  sentAt: string | null;
  completedAt: string | null;
}

export type EnvelopeStatus = 'draft' | 'sent' | 'pending' | 'completed' | 'voided' | 'expired';

export interface Signer {
  id: string;
  name: string;
  email: string;
  order: number;
  status: SignerStatus;
  signingToken: string | null;
  signedAt: string | null;
}

export type SignerStatus = 'pending' | 'sent' | 'viewed' | 'completed' | 'declined';

export interface Field {
  id: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string | null;
  required: boolean;
}

// ─── Envelope Filters ───────────────────────────────────────────────

export interface EnvelopeFilters {
  /** Filter by status */
  status?: EnvelopeStatus;
  /** Search by subject */
  search?: string;
  /** Pagination: page number (1-based) */
  page?: number;
  /** Pagination: items per page */
  limit?: number;
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'subject';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

export interface EnvelopeList {
  envelopes: Envelope[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ─── Templates ──────────────────────────────────────────────────────

export interface CreateTemplateInput {
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** Base document as Buffer, Blob, or base64 */
  document: Buffer | Blob | string;
  /** Role definitions */
  roles: TemplateRole[];
  /** Field definitions */
  fields?: FieldInput[];
}

export interface TemplateRole {
  name: string;
  order: number;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  roles: TemplateRole[];
  createdAt: string;
}

// ─── Webhooks ───────────────────────────────────────────────────────

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export type WebhookEvent =
  | 'envelope.created'
  | 'envelope.sent'
  | 'envelope.completed'
  | 'envelope.voided'
  | 'signer.viewed'
  | 'signer.completed'
  | 'signer.declined';

// ─── Audit ──────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  envelopeId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  actorId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// ─── Retention ──────────────────────────────────────────────────────

export interface RetentionPolicy {
  id: string;
  name: string;
  description: string | null;
  retentionDays: number;
  autoDelete: boolean;
}

// ─── Embed ──────────────────────────────────────────────────────────

export interface EmbedOptions {
  /** DOM element ID to embed the signing UI into */
  containerId: string;
  /** Signing token */
  token: string;
  /** Called when the signing UI is ready */
  onReady?: () => void;
  /** Called when the signer completes signing */
  onSigned?: (data: { envelopeId: string; signerId: string }) => void;
  /** Called when the signer declines */
  onDeclined?: (data: { envelopeId: string; reason?: string }) => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Custom styles for the iframe */
  style?: Partial<CSSStyleDeclaration>;
}

// ─── API Response ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
