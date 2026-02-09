/**
 * CoSeal SDK — Open Source E-Signature Client
 *
 * @example
 * ```typescript
 * import { CoSealClient } from '@coseal/sdk';
 *
 * const coseal = new CoSealClient({
 *   baseUrl: 'https://sign.yourcompany.com',
 *   apiKey: 'your-api-key',
 * });
 *
 * const envelope = await coseal.createEnvelope({
 *   document: fs.readFileSync('contract.pdf'),
 *   subject: 'Please sign the MSA',
 *   signers: [
 *     { email: 'alice@company.com', name: 'Alice', order: 1 },
 *   ],
 * });
 *
 * await coseal.sendEnvelope(envelope.id);
 * ```
 *
 * @module @coseal/sdk
 */

export { CoSealClient } from './client.js';

// Types
export type {
  CoSealConfig,
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
  CoSealError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
  TimeoutError,
  NetworkError,
} from './errors.js';
