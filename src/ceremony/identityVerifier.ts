import crypto from 'node:crypto';
import { sendSmsOtp } from '../notifications/smsSender.js';

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface StoredCode {
  hashedCode: string;
  expiresAt: Date;
}

// In-memory storage — in production, use Redis or database with TTL
const verificationCodes = new Map<string, StoredCode>();

// ─── AES Types ──────────────────────────────────────────────────────

export type AESVerificationMethod = 'email_sms' | 'government_id' | 'bank_id';

export interface AESVerificationResult {
  verified: boolean;
  method: AESVerificationMethod;
  provider: string;
  evidenceRef: string;
  verifiedAt: string;
  details: Record<string, unknown>;
}

export interface GovernmentIdResult {
  verified: boolean;
  documentType: string;   // passport | drivers_license | national_id
  documentCountry: string;
  fullName: string;
  dateOfBirth: string;
  expiryDate: string;
  verificationId: string;
  provider: string;
}

export interface IdentityVerificationEvidence {
  method: AESVerificationMethod;
  provider: string;
  verifiedAt: string;
  emailVerified?: boolean;
  smsVerified?: boolean;
  governmentIdResult?: GovernmentIdResult;
}

// ─── Basic OTP Functions ─────────────────────────────────────────────

/**
 * Generate a 6-digit verification code.
 */
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash a verification code for storage.
 */
function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Send email verification code.
 * Returns the hashed code for comparison.
 */
export async function sendEmailVerification(email: string): Promise<string> {
  const code = generateCode();
  const hashedCode = hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  verificationCodes.set(email, { hashedCode, expiresAt });

  // In production, send actual email via emailSender
  // For now, just log it
  console.log(`[Identity Verification] Code for ${email}: ${code}`);

  return hashedCode;
}

/**
 * Send SMS verification code.
 * Returns the hashed code for comparison.
 */
export async function sendSmsVerification(phone: string): Promise<string> {
  const code = generateCode();
  const hashedCode = hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  verificationCodes.set(phone, { hashedCode, expiresAt });

  await sendSmsOtp(phone, code);

  return hashedCode;
}

/**
 * Verify a code against the stored hashed code.
 */
export function verifyCode(inputCode: string, storedHashedCode: string): boolean {
  const inputHash = hashCode(inputCode);
  return crypto.timingSafeEqual(
    Buffer.from(inputHash, 'hex'),
    Buffer.from(storedHashedCode, 'hex'),
  );
}

/**
 * Verify code for a specific email/phone and check expiry.
 */
export function verifyCodeForContact(
  contact: string,
  inputCode: string,
): { valid: boolean; reason?: string } {
  const stored = verificationCodes.get(contact);

  if (!stored) {
    return { valid: false, reason: 'No verification code found' };
  }

  if (stored.expiresAt < new Date()) {
    verificationCodes.delete(contact);
    return { valid: false, reason: 'Code expired' };
  }

  const valid = verifyCode(inputCode, stored.hashedCode);

  if (valid) {
    verificationCodes.delete(contact); // One-time use
  }

  return { valid, reason: valid ? undefined : 'Invalid code' };
}

/**
 * Clean up expired codes (should be run periodically).
 */
export function cleanupExpiredCodes(): number {
  const now = new Date();
  let cleaned = 0;

  for (const [contact, stored] of verificationCodes.entries()) {
    if (stored.expiresAt < now) {
      verificationCodes.delete(contact);
      cleaned++;
    }
  }

  return cleaned;
}

// ─── AES-Level Identity Verification ─────────────────────────────────

/**
 * Perform AES-level identity verification using two-factor (email + SMS).
 * Both email and SMS OTPs must be verified.
 */
export async function verifyIdentityTwoFactor(
  email: string,
  phone: string,
): Promise<{ emailHash: string; smsHash: string }> {
  const emailHash = await sendEmailVerification(email);
  const smsHash = await sendSmsVerification(phone);

  return { emailHash, smsHash };
}

/**
 * Complete two-factor verification: check both codes.
 */
export function completeTwoFactorVerification(
  email: string,
  emailCode: string,
  phone: string,
  smsCode: string,
): AESVerificationResult {
  const emailResult = verifyCodeForContact(email, emailCode);
  const smsResult = verifyCodeForContact(phone, smsCode);

  if (!emailResult.valid || !smsResult.valid) {
    return {
      verified: false,
      method: 'email_sms',
      provider: 'internal',
      evidenceRef: '',
      verifiedAt: new Date().toISOString(),
      details: {
        emailVerified: emailResult.valid,
        emailError: emailResult.reason,
        smsVerified: smsResult.valid,
        smsError: smsResult.reason,
      },
    };
  }

  const evidenceRef = crypto.randomUUID();

  return {
    verified: true,
    method: 'email_sms',
    provider: 'internal',
    evidenceRef,
    verifiedAt: new Date().toISOString(),
    details: {
      emailVerified: true,
      smsVerified: true,
    },
  };
}

/**
 * Initiate government ID verification via Jumio or Onfido.
 * Returns a redirect URL or session info for the signer.
 */
export async function initiateGovernmentIdVerification(
  signerName: string,
  signerEmail: string,
): Promise<{
  sessionId: string;
  redirectUrl: string;
  provider: string;
}> {
  const jumioKey = process.env.JUMIO_API_KEY;
  const onfidoToken = process.env.ONFIDO_API_TOKEN;

  if (jumioKey) {
    // Jumio integration
    const sessionId = crypto.randomUUID();

    // In production, call Jumio's API to create a verification session
    // POST https://netverify.com/api/v4/initiate
    // For now, return a mock session
    console.log(`[GovernmentID] Jumio session created for ${signerEmail}: ${sessionId}`);

    return {
      sessionId,
      redirectUrl: `https://netverify.com/widget/v4/${sessionId}`,
      provider: 'jumio',
    };
  }

  if (onfidoToken) {
    // Onfido integration
    const sessionId = crypto.randomUUID();

    // In production, call Onfido's API to create an applicant and check
    // POST https://api.onfido.com/v3.6/applicants
    // POST https://api.onfido.com/v3.6/sdk_token
    console.log(`[GovernmentID] Onfido session created for ${signerEmail}: ${sessionId}`);

    return {
      sessionId,
      redirectUrl: `https://id.onfido.com/verify/${sessionId}`,
      provider: 'onfido',
    };
  }

  // No government ID provider configured — fall back to two-factor warning
  console.warn(
    '[GovernmentID] No ID verification provider configured (JUMIO_API_KEY or ONFIDO_API_TOKEN). ' +
    'Falling back to two-factor verification. For stronger AES compliance, configure a government ID provider.',
  );

  return {
    sessionId: '',
    redirectUrl: '',
    provider: 'none',
  };
}

/**
 * Check the status of a government ID verification session.
 */
export async function checkGovernmentIdStatus(
  sessionId: string,
  provider: string,
): Promise<GovernmentIdResult> {
  // In production, poll Jumio/Onfido API for verification result
  // For now, return a mock verified result
  console.log(`[GovernmentID] Checking status for ${provider} session ${sessionId}`);

  return {
    verified: true,
    documentType: 'passport',
    documentCountry: 'US',
    fullName: 'Verified User',
    dateOfBirth: '1990-01-01',
    expiryDate: '2030-12-31',
    verificationId: sessionId,
    provider,
  };
}

/**
 * Perform full AES-level identity verification.
 * Orchestrates the appropriate method based on configuration and request.
 */
export async function verifyIdentityAES(
  signerEmail: string,
  signerPhone: string | undefined,
  method: AESVerificationMethod,
): Promise<AESVerificationResult> {
  switch (method) {
    case 'email_sms': {
      if (!signerPhone) {
        return {
          verified: false,
          method,
          provider: 'internal',
          evidenceRef: '',
          verifiedAt: new Date().toISOString(),
          details: { error: 'Phone number required for two-factor verification' },
        };
      }

      // Initiate both verification codes
      await verifyIdentityTwoFactor(signerEmail, signerPhone);

      // Return pending — caller must collect codes and call completeTwoFactorVerification
      return {
        verified: false,
        method,
        provider: 'internal',
        evidenceRef: '',
        verifiedAt: '',
        details: { status: 'codes_sent', emailSent: true, smsSent: true },
      };
    }

    case 'government_id': {
      const session = await initiateGovernmentIdVerification('', signerEmail);

      if (session.provider === 'none') {
        // Fall back to two-factor
        if (signerPhone) {
          return verifyIdentityAES(signerEmail, signerPhone, 'email_sms');
        }
        return {
          verified: false,
          method,
          provider: 'none',
          evidenceRef: '',
          verifiedAt: new Date().toISOString(),
          details: { error: 'No ID verification provider configured and no phone for fallback' },
        };
      }

      return {
        verified: false,
        method,
        provider: session.provider,
        evidenceRef: session.sessionId,
        verifiedAt: '',
        details: { status: 'redirect_required', redirectUrl: session.redirectUrl },
      };
    }

    case 'bank_id': {
      // Placeholder for future bank ID integrations (BankID, iDIN, etc.)
      return {
        verified: false,
        method,
        provider: 'none',
        evidenceRef: '',
        verifiedAt: new Date().toISOString(),
        details: {
          error: 'Bank ID verification is not yet supported. Coming soon.',
          supported: false,
        },
      };
    }

    default:
      return {
        verified: false,
        method,
        provider: 'none',
        evidenceRef: '',
        verifiedAt: new Date().toISOString(),
        details: { error: `Unknown verification method: ${method}` },
      };
  }
}

/**
 * Build identity verification evidence for inclusion in
 * audit trail and Certificate of Completion.
 */
export function buildVerificationEvidence(
  result: AESVerificationResult,
): IdentityVerificationEvidence {
  return {
    method: result.method,
    provider: result.provider,
    verifiedAt: result.verifiedAt,
    emailVerified: result.details.emailVerified as boolean | undefined,
    smsVerified: result.details.smsVerified as boolean | undefined,
    governmentIdResult: result.details.governmentIdResult as GovernmentIdResult | undefined,
  };
}
