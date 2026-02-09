export {
  loadSigningKey,
  loadCertificate,
  generateSelfSignedCert,
  ensureCertificates,
} from './certManager.js';
export { hashDocument, verifyHash } from './hasher.js';
export { sealDocument, verifySealedDocument } from './sealer.js';
export type { IdentityEvidence } from './sealer.js';
export { generateCompletionCertificate } from './completionCert.js';
export type { IdentityVerificationDetail, SignerDetail, AuditEntry, EnvelopeWithDetails } from './completionCert.js';
export { getTSP, getConfiguredTSP, isQESAvailable } from './tspIntegration.js';
export type { TrustServiceProvider, SignerInfo, QESSession, QESStatus, QESSignatureResult } from './tspIntegration.js';
