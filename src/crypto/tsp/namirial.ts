/**
 * Namirial TSP adapter for QES.
 *
 * Namirial provides:
 * - Qualified electronic signatures compliant with EU eIDAS regulation
 * - Cloud-based qualified signature creation device (QSCD)
 * - Video identification and remote signing
 *
 * API Documentation: https://www.namirial.com/en/digital-trust/signing-solutions/
 *
 * Required environment variables:
 * - NAMIRIAL_API_URL: API endpoint URL
 * - NAMIRIAL_API_KEY: API key
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

export class NamirialTSP implements TrustServiceProvider {
  readonly name = 'Namirial Qualified Signature Service';
  readonly providerId = 'namirial';

  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.apiUrl = process.env.NAMIRIAL_API_URL ?? 'https://api.namirial.com/v1';
    this.apiKey = process.env.NAMIRIAL_API_KEY ?? '';

    if (!this.apiKey) {
      console.warn(
        '[NamirialTSP] NAMIRIAL_API_KEY not configured. ' +
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
      // Mock mode
      console.log(`[NamirialTSP] Mock session created: ${sessionId} for ${signer.email}`);

      sessions.get(sessionId)!.status = 'identity_pending';

      return {
        sessionId,
        provider: this.providerId,
        status: 'identity_pending',
        identityVerificationUrl: `https://id.namirial.com/verify/${sessionId}`,
        expiresAt,
      };
    }

    // Production: Call Namirial API to create signing session
    // POST {apiUrl}/signing-sessions
    try {
      const response = await fetch(`${this.apiUrl}/signing-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({
          sessionId,
          signer: {
            firstName: signer.name.split(' ')[0],
            lastName: signer.name.split(' ').slice(1).join(' ') || signer.name,
            email: signer.email,
            phone: signer.phone,
            dateOfBirth: signer.dateOfBirth,
            nationality: signer.nationality,
          },
          identificationMethod: 'video_ident',
          signatureLevel: 'QES',
          callbackUrl: `${process.env.BASE_URL ?? 'http://localhost:3000'}/api/qes/callback`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Namirial API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      sessions.get(sessionId)!.status = 'identity_pending';

      return {
        sessionId,
        provider: this.providerId,
        status: 'identity_pending',
        identityVerificationUrl: data.identificationUrl,
        expiresAt,
      };
    } catch (error) {
      console.error('[NamirialTSP] Error initiating QES:', error);
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
      // Mock mode: auto-advance
      if (session.status === 'identity_pending') {
        session.status = 'identity_verified';
      } else if (session.status === 'identity_verified') {
        session.status = 'signing_ready';
      }
      return session.status;
    }

    // Production: poll Namirial API
    try {
      const response = await fetch(`${this.apiUrl}/signing-sessions/${sessionId}`, {
        headers: { 'X-Api-Key': this.apiKey },
      });

      if (!response.ok) {
        return session.status;
      }

      const data = await response.json();
      session.status = mapNamirialStatus(data.status);
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
      // Mock mode
      const mockCert = Buffer.from(
        `-----BEGIN CERTIFICATE-----\n` +
        `MOCK_NAMIRIAL_QUALIFIED_CERTIFICATE_${sessionId}\n` +
        `Issuer: CN=Namirial QTSP, O=Namirial S.p.A.\n` +
        `Subject: CN=${session.signer.name}, EMAIL=${session.signer.email}\n` +
        `-----END CERTIFICATE-----`,
      );
      session.certificateData = mockCert;
      return mockCert;
    }

    // Production: retrieve certificate from Namirial
    const response = await fetch(`${this.apiUrl}/signing-sessions/${sessionId}/certificate`, {
      headers: { 'X-Api-Key': this.apiKey },
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
      // Mock mode
      const mockSignature = crypto.createHash('sha256')
        .update(`namirial:${sessionId}:${documentHash}`)
        .digest();

      session.status = 'signed';

      return {
        signature: mockSignature,
        certificate: await this.getQualifiedCertificate(sessionId),
        timestamp: new Date().toISOString(),
        tspName: this.name,
        certificateSerial: `NAMIRIAL-${sessionId.substring(0, 8)}`,
        qscdReference: `QSCD-NAM-${sessionId.substring(0, 8)}`,
      };
    }

    // Production: send hash to Namirial QSCD
    const response = await fetch(`${this.apiUrl}/signing-sessions/${sessionId}/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify({
        documentHash,
        hashAlgorithm: 'SHA-256',
        signatureFormat: 'CAdES',
      }),
    });

    if (!response.ok) {
      throw new Error(`Namirial signing failed: ${response.statusText}`);
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

function mapNamirialStatus(status: string): QESStatus {
  switch (status) {
    case 'IDENTIFICATION_PENDING': return 'identity_pending';
    case 'IDENTIFIED': return 'identity_verified';
    case 'CERTIFICATE_ISSUED': return 'certificate_issued';
    case 'READY_TO_SIGN': return 'signing_ready';
    case 'SIGNED': return 'signed';
    case 'EXPIRED': return 'expired';
    case 'FAILED': return 'failed';
    default: return 'initiated';
  }
}
