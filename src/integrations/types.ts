/**
 * Standard integration interface for CoSeal ecosystem connectors.
 */

import type { Envelope } from '../db/schema.js';

export interface CoSealIntegration {
  /** Integration name (unique identifier) */
  readonly name: string;

  /** Human-readable display name */
  readonly displayName: string;

  /** Short description of what this integration does */
  readonly description: string;

  /** Initialize the integration with user-provided configuration */
  initialize(config: Record<string, string>): Promise<void>;

  /** Test the integration connection (optional) */
  testConnection?(): Promise<{ success: boolean; message: string }>;

  /** Called when an envelope is sent */
  onEnvelopeSent?(envelope: Envelope): Promise<void>;

  /** Called when an envelope is completed (all signers done) */
  onEnvelopeCompleted?(envelope: Envelope): Promise<void>;

  /** Called when an envelope is voided */
  onEnvelopeVoided?(envelope: Envelope): Promise<void>;

  /** Called when a signer completes their part */
  onSignerCompleted?(signer: { id: string; name: string; email: string }, envelope: Envelope): Promise<void>;

  /** Cleanup resources (optional) */
  destroy?(): Promise<void>;
}

export interface IntegrationConfig {
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationError extends Error {
  integrationName: string;
  originalError?: Error;
}
