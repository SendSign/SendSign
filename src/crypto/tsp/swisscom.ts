/**
 * Swisscom All-in Signing Service (AIS) adapter for QES.
 *
 * Swisscom AIS provides:
 * - Qualified electronic signatures compliant with Swiss (ZertES) and EU (eIDAS) regulations
 * - On-demand certificate issuance and signing via REST API
 * - Video identification or existing SwissID for identity verification
 *
 * API Documentation: https://www.swisscom.ch/en/business/enterprise/offer/security/all-in-signing-service.html
 *
 * Required environment variables:
 * - SWISSCOM_AIS_URL: API endpoint URL
 * - SWISSCOM_AIS_KEY: API key or client certificate password
 * - SWISSCOM_AIS_CERT_PATH: Path to client certificate PEM
 */

import crypto from 'node:crypto';
import type {
  TrustServiceProvider,
  SignerInfo,
  QESSession,
  QESStatus,
  QESSignatureResult,
} from '../tspIntegration.js';

// In-memory session store (use database in production)
const sessions = new Map<string, {
  signer: SignerInfo;
  status: QESStatus;
  createdAt: string;
  certificateData?: Buffer;
}>();

export class SwisscomTSP implements TrustServiceProvider {
  readonly name = 'Swisscom All-in Signing Service';
  readonly providerId = 'swisscom';

  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.apiUrl = process.env.SWISSCOM_AIS_URL ?? 'https://ais.swisscom.com/AIS-Server/rs/v1.0';
    this.apiKey = process.env.SWISSCOM_AIS_KEY ?? '';

    if (!this.apiKey) {
      console.warn(
        '[SwisscomTSP] SWISSCOM_AIS_KEY not configured. ' +
        'QES signing will use mock mode. Configure credentials for production.',
      );
    }
  }

  async initiateQES(signer: SignerInfo): Promise<QESSession> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    sessions.set(sessionId, {
      signer,
      status: 'initiated',
      createdAt: new Date().toISOString(),
    });

    if (!this.apiKey) {
      // Mock mode — simulate identity verification URL
      console.log(`[SwisscomTSP] Mock session created: ${sessionId} for ${signer.email}`);

      sessions.get(sessionId)!.status = 'identity_pending';

      return {
        sessionId,
        provider: this.providerId,
        status: 'identity_pending',
        identityVerificationUrl: `https://ident.swisscom.ch/verify/${sessionId}`,
        expiresAt,
      };
    }

    // Production: Call Swisscom AIS API to initiate signing request
    // POST {apiUrl}/sign
    // Body: {
    //   "SignRequest": {
    //     "RequestID": sessionId,
    //     "Profile": "http://ais.swisscom.ch/1.1",
    //     "OptionalInputs": {
    //       "ClaimedIdentity": { "Name": "SendSign" },
    //       "SignatureType": "urn:ietf:rfc:3369",
    //       "AddTimestamp": { "Type": "urn:ietf:rfc:3161" }
    //     },
    //     "InputDocuments": {
    //       "DocumentHash": { "dsig:DigestMethod": { "Algorithm": "SHA-256" } }
    //     }
    //   }
    // }

    try {
      const response = await fetch(`${this.apiUrl}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          requestId: sessionId,
          signer: {
            distinguishedName: `CN=${signer.name}, EMAIL=${signer.email}`,
            stepUpAuthorisation: {
              phone: {
                msisdn: signer.phone,
                message: 'SendSign: Please confirm your qualified signature.',
                language: 'en',
              },
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Swisscom AIS API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      sessions.get(sessionId)!.status = 'identity_pending';

      return {
        sessionId,
        provider: this.providerId,
        status: 'identity_pending',
        identityVerificationUrl: data.identityVerificationUrl,
        expiresAt,
      };
    } catch (error) {
      console.error('[SwisscomTSP] Error initiating QES:', error);
      sessions.get(sessionId)!.status = 'failed';

      return {
        sessionId,
        provider: this.providerId,
        status: 'failed',
        expiresAt,
      };
    }
  }

  async checkStatus(sessionId: string): Promise<QESStatus> {
    const session = sessions.get(sessionId);
    if (!session) {
      return 'failed';
    }

    if (!this.apiKey) {
      // Mock mode: auto-advance to identity_verified after check
      if (session.status === 'identity_pending') {
        session.status = 'identity_verified';
      } else if (session.status === 'identity_verified') {
        session.status = 'signing_ready';
      }
      return session.status;
    }

    // Production: poll Swisscom AIS API for status
    try {
      const response = await fetch(`${this.apiUrl}/pending/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        return session.status;
      }

      const data = await response.json();
      session.status = mapSwisscomStatus(data.status);
      return session.status;
    } catch {
      return session.status;
    }
  }

  async getQualifiedCertificate(sessionId: string): Promise<Buffer> {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.certificateData) {
      return session.certificateData;
    }

    if (!this.apiKey) {
      // Mock mode: generate a fake certificate
      const mockCert = Buffer.from(
        `-----BEGIN CERTIFICATE-----\n` +
        `MOCK_QUALIFIED_CERTIFICATE_${sessionId}\n` +
        `Issuer: CN=Swisscom TSP, O=Swisscom\n` +
        `Subject: CN=${session.signer.name}, EMAIL=${session.signer.email}\n` +
        `-----END CERTIFICATE-----`,
      );
      session.certificateData = mockCert;
      return mockCert;
    }

    // Production: retrieve certificate from Swisscom
    const response = await fetch(`${this.apiUrl}/certificate/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to retrieve certificate: ${response.statusText}`);
    }

    const certData = Buffer.from(await response.arrayBuffer());
    session.certificateData = certData;
    return certData;
  }

  async signWithQSCD(sessionId: string, documentHash: string): Promise<QESSignatureResult> {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!this.apiKey) {
      // Mock mode: generate a fake signature
      const mockSignature = crypto.createHash('sha256')
        .update(`${sessionId}:${documentHash}`)
        .digest();

      session.status = 'signed';

      return {
        signature: mockSignature,
        certificate: await this.getQualifiedCertificate(sessionId),
        timestamp: new Date().toISOString(),
        tspName: this.name,
        certificateSerial: `MOCK-${sessionId.substring(0, 8)}`,
        qscdReference: `QSCD-${sessionId.substring(0, 8)}`,
      };
    }

    // Production: send hash to Swisscom QSCD for signing
    const response = await fetch(`${this.apiUrl}/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        requestId: sessionId,
        documentHash,
        hashAlgorithm: 'SHA-256',
      }),
    });

    if (!response.ok) {
      throw new Error(`Swisscom signing failed: ${response.statusText}`);
    }

    const data = await response.json();
    session.status = 'signed';

    return {
      signature: Buffer.from(data.signature, 'base64'),
      certificate: await this.getQualifiedCertificate(sessionId),
      timestamp: data.timestamp ?? new Date().toISOString(),
      tspName: this.name,
      certificateSerial: data.certificateSerial ?? '',
      qscdReference: data.qscdReference ?? '',
    };
  }
}

function mapSwisscomStatus(status: string): QESStatus {
  switch (status) {
    case 'PENDING': return 'identity_pending';
    case 'VERIFIED': return 'identity_verified';
    case 'READY': return 'signing_ready';
    case 'SIGNED': return 'signed';
    case 'EXPIRED': return 'expired';
    case 'FAILED': return 'failed';
    default: return 'initiated';
  }
}
