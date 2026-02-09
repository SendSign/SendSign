/**
 * Trust Service Provider (TSP) abstraction layer for Qualified Electronic Signatures (QES).
 *
 * QES requires:
 * - A qualified certificate issued by a qualified TSP
 * - A qualified signature creation device (QSCD)
 * - Identity verification meeting eIDAS standards
 *
 * CoSeal integrates with external TSPs to request qualified certificates on behalf of signers.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface SignerInfo {
  name: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  nationality?: string;
}

export interface QESSession {
  sessionId: string;
  provider: string;
  status: QESStatus;
  identityVerificationUrl?: string;
  expiresAt: string;
}

export type QESStatus =
  | 'initiated'
  | 'identity_pending'
  | 'identity_verified'
  | 'certificate_issued'
  | 'signing_ready'
  | 'signed'
  | 'failed'
  | 'expired';

export interface QESSignatureResult {
  signature: Buffer;
  certificate: Buffer;
  timestamp: string;
  tspName: string;
  certificateSerial: string;
  qscdReference: string;
}

// ─── TSP Interface ──────────────────────────────────────────────────

export interface TrustServiceProvider {
  /** Provider name */
  readonly name: string;

  /** Provider identifier (swisscom, namirial, etc.) */
  readonly providerId: string;

  /** Start a QES session for a signer */
  initiateQES(signer: SignerInfo): Promise<QESSession>;

  /** Check the status of a QES session */
  checkStatus(sessionId: string): Promise<QESStatus>;

  /** Retrieve the qualified certificate issued for the signer */
  getQualifiedCertificate(sessionId: string): Promise<Buffer>;

  /** Request the TSP's QSCD to sign a document hash */
  signWithQSCD(sessionId: string, documentHash: string): Promise<QESSignatureResult>;
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Get a TSP adapter by provider name.
 * Throws if the provider is not configured.
 */
export async function getTSP(provider: string): Promise<TrustServiceProvider> {
  switch (provider.toLowerCase()) {
    case 'swisscom': {
      const { SwisscomTSP } = await import('./tsp/swisscom.js');
      return new SwisscomTSP();
    }
    case 'namirial': {
      const { NamirialTSP } = await import('./tsp/namirial.js');
      return new NamirialTSP();
    }
    default:
      throw new Error(
        `Unknown QES provider: ${provider}. ` +
        `Supported providers: swisscom, namirial. ` +
        `See docs/COMPLIANCE.md for setup instructions.`,
      );
  }
}

/**
 * Get the configured TSP from environment variables.
 * Returns null if no TSP is configured.
 */
export function getConfiguredTSP(): string | null {
  return process.env.QES_PROVIDER || null;
}

/**
 * Check if QES is available (a TSP is configured).
 */
export function isQESAvailable(): boolean {
  return !!getConfiguredTSP();
}
