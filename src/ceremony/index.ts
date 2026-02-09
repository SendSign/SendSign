export {
  generateSigningToken,
  generateTokenExpiry,
  validateToken,
  assignToken,
  voidToken,
} from './tokenGenerator.js';

export {
  sendEmailVerification,
  sendSmsVerification,
  verifyCode,
  verifyCodeForContact,
  cleanupExpiredCodes,
  verifyIdentityAES,
  verifyIdentityTwoFactor,
  completeTwoFactorVerification,
  initiateGovernmentIdVerification,
  checkGovernmentIdStatus,
  buildVerificationEvidence,
} from './identityVerifier.js';

export type {
  AESVerificationMethod,
  AESVerificationResult,
  GovernmentIdResult,
  IdentityVerificationEvidence,
} from './identityVerifier.js';
