/**
 * SendSign SDK — Open Source E-Signature Client
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
 *
 * @module @sendsign/sdk
 */

export { SendSignClient } from './client.js';

// Types
export type {
  SendSignConfig,
  CreateEnvelopeInput,
  SignerInput,
  FieldInput,
  FieldType,
  Envelope,
  EnvelopeStatus,
  Signer,
  SignerStatus,
  Field,
  EnvelopeFilters,
  EnvelopeList,
  CreateTemplateInput,
  TemplateRole,
  Template,
  Webhook,
  WebhookEvent,
  AuditEvent,
  RetentionPolicy,
  EmbedOptions,
  ApiResponse,
} from './types.js';

// Errors
export {
  SendSignError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
  TimeoutError,
  NetworkError,
} from './errors.js';
