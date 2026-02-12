# SendSign Security Documentation

This document outlines SendSign's security architecture, best practices, and guidelines for secure deployment.

---

## Security Model

SendSign follows a **defense-in-depth** approach with multiple layers of security:

1. **Encryption at rest** — Documents are encrypted before storage
2. **Encryption in transit** — TLS for all network communications
3. **Authentication** — API key and token-based access control
4. **Audit trail** — Immutable logs of all actions
5. **Rate limiting** — Protection against abuse
6. **Input validation** — All user input is validated and sanitized

---

## Encryption

### At Rest (Documents)

**Algorithm:** AES-256-GCM (Galois/Counter Mode)

**Key derivation:** PBKDF2 with 100,000 iterations

**How it works:**
1. Documents are encrypted before being uploaded to S3
2. Each document uses a unique initialization vector (IV)
3. The encryption key is derived from the `ENCRYPTION_KEY` environment variable
4. The IV and authentication tag are prepended to the encrypted data

**Implementation:**
```javascript
// Simplified example
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
const authTag = cipher.getAuthTag();
const result = Buffer.concat([iv, authTag, encrypted]);
```

**Key management:**
- The `ENCRYPTION_KEY` must be at least 32 characters
- Store the key securely (environment variable, secrets manager)
- **NEVER** commit the key to source control
- Rotate the key periodically (requires re-encrypting all documents)

**Backup:**
- **CRITICAL**: If you lose the encryption key, you lose access to all documents
- Store the key in multiple secure locations
- Consider using a hardware security module (HSM) for production

### In Transit (Network)

**Protocol:** TLS 1.2 or 1.3

**Implementation:**
- SendSign does **not** handle TLS termination directly
- Use a reverse proxy (Nginx, Traefik) or cloud load balancer
- Enforce HTTPS for all connections

**Example Nginx configuration:**
```nginx
server {
  listen 443 ssl http2;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
  ssl_prefer_server_ciphers on;
  ssl_certificate /etc/ssl/certs/sendsign.crt;
  ssl_certificate_key /etc/ssl/private/sendsign.key;
}
```

### Cryptographic Sealing

**Algorithm:** SHA-256 (hashing) + PKCS#7 (CMS detached signature) + RSA-2048 or RSA-4096

**How it works:**
1. Compute SHA-256 hash of the completed PDF
2. Sign the hash using a private key (RSA)
3. Generate a PKCS#7 detached signature
4. Embed the signature and certificate in the PDF as metadata and attachments

**Certificate management:**
- For development: Self-signed certificates (auto-generated)
- For production: Obtain a certificate from a trusted Certificate Authority (CA)

**Verification:**
- Anyone can verify the sealed document by extracting the signature and certificate
- The SHA-256 hash proves the document hasn't been altered
- The certificate proves the signature is authentic

---

## Authentication

### API Key Authentication

**Format:** Bearer token

**Header:**
```
Authorization: Bearer <api-key>
```

**Generation:**
```bash
openssl rand -hex 32
```

**Storage:**
- Store API keys as environment variables or in a secrets manager
- Never expose API keys in client-side code or public repositories
- Use different API keys for different environments (dev, staging, production)

**Rotation:**
- Rotate API keys at least every 90 days
- Implement a key rotation process with overlap (new key issued before old key expires)

### Signing Token Authentication

**Format:** UUID v4

**Purpose:** Single-use token for signers to access the signing ceremony

**Properties:**
- Each token is unique and tied to a specific signer and envelope
- Tokens expire after a configurable period (default: 72 hours)
- Tokens are voided after use (single-use)
- Tokens can be regenerated if needed (e.g., signer lost the email)

**How it works:**
1. When an envelope is sent, a signing token is generated for each signer
2. The token is sent to the signer via email (or SMS)
3. The signer uses the token to access the signing ceremony (no password required)
4. After signing, the token is voided

**Security considerations:**
- Tokens are random UUIDs (128 bits of entropy)
- Tokens are stored hashed in the database (not plaintext)
- Token expiry reduces the window for attacks
- Rate limiting prevents token enumeration attacks

---

## Identity Verification

SendSign supports multiple levels of identity verification:

### None (Default)
- **Verification:** Email address only
- **Use case:** Low-risk documents, internal approvals
- **Security:** Basic (email could be compromised)

### Low (Email + SMS OTP)
- **Verification:** 6-digit code sent via SMS
- **Use case:** Standard NDAs, vendor agreements
- **Security:** Medium (requires access to phone number)

### Medium (Email + SMS + Phone)
- **Verification:** SMS OTP + phone call verification
- **Use case:** Financial agreements, HR documents
- **Security:** High (multi-factor authentication)

### High (Government ID Check)
- **Verification:** Upload and verify passport, driver's license, or national ID
- **Provider:** Jumio, Onfido, or equivalent (integration required)
- **Use case:** Regulated industries, high-value contracts
- **Security:** Very high (biometric + document verification)

**Implementation:**
```json
{
  "signers": [
    {
      "name": "Alice",
      "email": "alice@example.com",
      "verificationLevel": "high"
    }
  ]
}
```

---

## Audit Trail Immutability

The audit trail is a **tamper-proof record** of all actions.

**How it works:**
1. Every action (envelope created, document viewed, signature added) generates an audit event
2. Events are written to the database with referential integrity constraints
3. Events are **append-only** — no updates or deletes are allowed
4. Events include timestamp, actor ID, IP address, and action details

**Protection against tampering:**
- Database constraints prevent modification of audit records
- Audit trail is included in the Certificate of Completion (PDF)
- Audit trail can be exported as JSON for external verification
- Future enhancement: Blockchain anchoring for cryptographic proof of event order

**Exporting audit trail:**
```bash
curl -H "Authorization: Bearer <api-key>" \
  http://localhost:3000/api/envelopes/env_abc123/audit \
  > audit-trail.json
```

---

## Rate Limiting

SendSign implements rate limiting to protect against abuse and denial-of-service attacks.

**Limits:**
- **API endpoints:** 100 requests per minute per IP
- **Signing endpoints:** 20 requests per minute per IP

**HTTP response when rate limited:**
```
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
  "success": false,
  "error": "Too many requests, please try again later"
}
```

**Customization:**
```javascript
// src/api/middleware/rateLimit.ts
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
});
```

**DDoS protection:**
- For production, use a cloud-based DDoS protection service (Cloudflare, AWS Shield)
- SendSign's rate limiting is a first layer, not a complete DDoS solution

---

## Input Validation

All user input is validated using **Zod schemas**.

**Example:**
```typescript
const createEnvelopeSchema = z.object({
  subject: z.string().min(1).max(255),
  message: z.string().max(1000).optional(),
  signingOrder: z.enum(['sequential', 'parallel', 'mixed']),
  signers: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
    order: z.number().int().positive(),
  })),
});
```

**Protection against:**
- SQL injection (using parameterized queries via Drizzle ORM)
- XSS (input sanitization, Content-Security-Policy headers)
- Path traversal (validating file paths)
- Malicious PDF uploads (file type validation, size limits)

**Security headers:**
- `helmet.js` is used to set secure HTTP headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Strict-Transport-Security` (if HTTPS)
  - `Content-Security-Policy`

---

## Secure Defaults

SendSign ships with secure defaults:

| Setting                      | Default                                         | Rationale                                           |
|------------------------------|-------------------------------------------------|-----------------------------------------------------|
| Encryption algorithm         | AES-256-GCM                                     | Industry standard for data encryption               |
| Token expiry                 | 72 hours                                        | Balance between usability and security              |
| Signing certificate          | Self-signed (dev), CA-issued (production)       | Auto-generated for easy setup, but CA required for production |
| Rate limiting                | 100 req/min (API), 20 req/min (signing)         | Prevent abuse while allowing normal usage           |
| Document retention           | 7 years                                         | Meets most regulatory requirements                  |
| CORS                         | Disabled by default                             | Enable only for trusted origins                     |
| API authentication           | Required for all endpoints (except health)      | Prevent unauthorized access                         |

---

## Vulnerability Reporting

**Responsible Disclosure Policy**

If you discover a security vulnerability in SendSign, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: **security@sendsign.dev** (or use GitHub Security Advisories)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

**What to expect:**
- Acknowledgment within 48 hours
- Regular updates on the investigation
- Credit in the security advisory (if desired)
- Coordinated disclosure timeline

**Bug bounty program:** Not currently available (may be introduced in the future)

---

## Security Checklist

### Development

- [ ] Never commit secrets (API keys, encryption keys, passwords) to source control
- [ ] Use `.env` files for local development (excluded from git)
- [ ] Run security linters (ESLint, npm audit)
- [ ] Keep dependencies up to date
- [ ] Use strong, unique passwords for all services

### Deployment

- [ ] Use TLS (HTTPS) for all connections
- [ ] Rotate API keys every 90 days
- [ ] Store secrets in a secrets manager (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault)
- [ ] Enable database encryption at rest
- [ ] Enable S3 encryption at rest
- [ ] Restrict network access (firewalls, security groups)
- [ ] Use a non-root user for running the application
- [ ] Disable unnecessary services and ports
- [ ] Implement monitoring and alerting for suspicious activity

### Production

- [ ] Obtain a certificate from a trusted CA for document sealing
- [ ] Set up regular database backups
- [ ] Set up regular S3 backups (versioning, cross-region replication)
- [ ] Configure log aggregation and monitoring
- [ ] Test disaster recovery procedures
- [ ] Conduct periodic security audits
- [ ] Implement intrusion detection (IDS/IPS)
- [ ] Enable two-factor authentication for admin access
- [ ] Document your security policies

---

## Compliance

SendSign's security features help meet requirements for:

- **SOC 2 Type II** (security controls)
- **ISO 27001** (information security management)
- **HIPAA** (healthcare data security)
- **GDPR** (data protection)
- **PCI DSS** (if processing payment information alongside signatures)

See [COMPLIANCE.md](./COMPLIANCE.md) for detailed compliance guidance.

---

## Security Roadmap

Future security enhancements:

- [ ] **Hardware security module (HSM) support** for key management
- [ ] **Blockchain anchoring** for audit trail immutability proof
- [ ] **OAuth 2.0 / OIDC** for user authentication (in addition to API keys)
- [ ] **Role-based access control (RBAC)** for multi-tenant deployments
- [ ] **Advanced threat detection** using machine learning
- [ ] **Zero-knowledge encryption** (end-to-end encryption where SendSign never sees plaintext)
- [ ] **FIDO2 / WebAuthn** for passwordless authentication
- [ ] **Security audit** by a third-party firm
- [ ] **Penetration testing** program

---

## Support

For security-related questions (non-vulnerabilities):

- **GitHub Discussions**: [https://github.com/sendsign/sendsign/discussions](https://github.com/sendsign/sendsign/discussions)
- **Email**: security@sendsign.dev

For vulnerability reports, use the responsible disclosure process described above.
