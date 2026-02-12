import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { signers } from '../db/schema.js';

const DEFAULT_EXPIRY_HOURS = 72;

/**
 * Generate a unique signing token (UUID v4).
 */
export function generateSigningToken(): string {
  return uuidv4();
}

/**
 * Generate a token expiry date.
 * @param hours - Number of hours until expiry (default: 72)
 */
export function generateTokenExpiry(hours?: number): Date {
  const h = hours ?? parseInt(process.env.SIGNING_TOKEN_EXPIRY_HOURS ?? String(DEFAULT_EXPIRY_HOURS), 10);
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

export interface TokenValidationResult {
  valid: boolean;
  signer?: {
    id: string;
    envelopeId: string;
    tenantId: string;
    name: string;
    email: string;
    status: string;
  };
  reason?: string;
}

/**
 * Validate a signing token.
 * Checks: token exists, not expired, signer status is 'pending' or 'sent'.
 */
export async function validateToken(token: string): Promise<TokenValidationResult> {
  try {
    const db = getDb();
    const [signer] = await db
      .select()
      .from(signers)
      .where(eq(signers.signingToken, token));

    if (!signer) {
      return { valid: false, reason: 'Token not found' };
    }

    if (signer.tokenExpiresAt && signer.tokenExpiresAt < new Date()) {
      return { valid: false, reason: 'Token expired', signer: mapSigner(signer) };
    }

    // Accept pending, sent, or notified — all mean "hasn't signed yet"
    const validStatuses = ['pending', 'sent', 'notified'];
    if (!validStatuses.includes(signer.status)) {
      return {
        valid: false,
        reason: `Signer has already ${signer.status}`,
        signer: mapSigner(signer),
      };
    }

    return { valid: true, signer: mapSigner(signer) };
  } catch (error) {
    console.error('Token validation failed:', error);
    return { valid: false, reason: 'Internal error during token validation' };
  }
}

function mapSigner(signer: typeof signers.$inferSelect) {
  return {
    id: signer.id,
    envelopeId: signer.envelopeId,
    tenantId: signer.tenantId,
    name: signer.name,
    email: signer.email,
    status: signer.status,
  };
}

/**
 * Assign a new token to a signer and set its expiry.
 */
export async function assignToken(
  signerId: string,
  hours?: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSigningToken();
  const expiresAt = generateTokenExpiry(hours);
  const db = getDb();

  await db
    .update(signers)
    .set({
      signingToken: token,
      tokenExpiresAt: expiresAt,
    })
    .where(eq(signers.id, signerId));

  return { token, expiresAt };
}

/**
 * Void/invalidate a signer's token (e.g., after correction).
 */
export async function voidToken(signerId: string): Promise<void> {
  const db = getDb();
  await db
    .update(signers)
    .set({
      signingToken: null,
      tokenExpiresAt: null,
    })
    .where(eq(signers.id, signerId));
}
