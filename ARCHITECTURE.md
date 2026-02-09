# CoSeal Architecture

> Technical specification for the CoSeal e-signature engine and Cowork plugin.

---

## System Overview

CoSeal is two things:

1. **A Cowork plugin** — markdown and JSON files that add signing commands to Claude's workflow, designed to work alongside the Legal plugin.
2. **A signing microservice** — a Node.js service that handles document preparation, the signing ceremony, cryptographic sealing, audit logging, and storage.

The plugin sends instructions to the service via MCP (Model Context Protocol). The service exposes a REST API that can also be used independently of Cowork.

---

## Plugin Structure

```
coseal-plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── .mcp.json                    # MCP connector to signing service
├── README.md
├── commands/
│   ├── send-for-signature.md    # /coseal:send
│   ├── check-status.md          # /coseal:status
│   ├── send-reminder.md         # /coseal:remind
│   ├── void-envelope.md         # /coseal:void
│   ├── download-signed.md       # /coseal:download
│   └── manage-templates.md      # /coseal:templates
└── skills/
    ├── signing-workflow/
    │   └── SKILL.md             # End-to-end signing orchestration
    ├── field-placement/
    │   └── SKILL.md             # Intelligent field detection & placement
    ├── signer-routing/
    │   └── SKILL.md             # Multi-party signing logic
    └── audit-compliance/
        └── SKILL.md             # Compliance and audit trail knowledge
```

### plugin.json

```json
{
  "name": "coseal",
  "version": "0.1.0",
  "displayName": "CoSeal — Open Source E-Signatures",
  "description": "Send documents for legally binding electronic signatures directly from Claude. Reviews to redlines to signatures — all in one workflow.",
  "author": "CoSeal Contributors",
  "license": "Apache-2.0",
  "commands": [
    "commands/send-for-signature.md",
    "commands/check-status.md",
    "commands/send-reminder.md",
    "commands/void-envelope.md",
    "commands/download-signed.md",
    "commands/manage-templates.md"
  ],
  "skills": [
    "skills/signing-workflow/SKILL.md",
    "skills/field-placement/SKILL.md",
    "skills/signer-routing/SKILL.md",
    "skills/audit-compliance/SKILL.md"
  ],
  "dependencies": {
    "connectors": ["coseal-service"]
  }
}
```

### .mcp.json

```json
{
  "mcpServers": {
    "coseal-service": {
      "type": "http",
      "url": "${COSEAL_SERVICE_URL:-http://localhost:3000}",
      "description": "CoSeal signing service — handles document prep, signing ceremony, crypto sealing, and audit trail",
      "auth": {
        "type": "bearer",
        "token": "${COSEAL_API_KEY}"
      }
    }
  }
}
```

---

## Signing Service Architecture

```
coseal-service/
├── src/
│   ├── index.ts                 # Express app entry point
│   ├── config/
│   │   └── index.ts             # Environment config + validation
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── envelopes.ts     # CRUD for signing envelopes
│   │   │   ├── signing.ts       # Signing ceremony endpoints
│   │   │   ├── templates.ts     # Template management
│   │   │   ├── webhooks.ts      # Outbound webhook config
│   │   │   └── health.ts        # Health check
│   │   └── middleware/
│   │       ├── auth.ts          # API key / JWT validation
│   │       ├── rateLimit.ts     # Rate limiting
│   │       └── validate.ts      # Request validation (zod)
│   │
│   ├── documents/
│   │   ├── pdfRenderer.ts       # PDF parsing and rendering
│   │   ├── fieldPlacer.ts       # Signature field placement engine
│   │   ├── templateEngine.ts    # Reusable template management
│   │   └── merger.ts            # Combine signed pages into final doc
│   │
│   ├── workflow/
│   │   ├── envelopeManager.ts   # Envelope lifecycle management
│   │   ├── signingOrder.ts      # Sequential / parallel / conditional routing
│   │   ├── reminderScheduler.ts # Automated reminder cron
│   │   └── expiryManager.ts     # Envelope expiration handling
│   │
│   ├── ceremony/
│   │   ├── tokenGenerator.ts    # Secure, expiring signer URLs
│   │   ├── identityVerifier.ts  # Email, SMS OTP, ID check
│   │   └── signatureCapture.ts  # Signature image processing
│   │
│   ├── crypto/
│   │   ├── hasher.ts            # SHA-256 document hashing
│   │   ├── sealer.ts            # X.509 certificate embedding in PDF
│   │   ├── certManager.ts       # Certificate generation and management
│   │   └── completionCert.ts    # Certificate of Completion generation
│   │
│   ├── audit/
│   │   ├── auditLogger.ts       # Immutable event logging
│   │   ├── eventTypes.ts        # Typed audit events
│   │   └── exporters.ts         # Audit trail export (PDF, JSON, CSV)
│   │
│   ├── storage/
│   │   ├── documentStore.ts     # S3-compatible encrypted storage
│   │   ├── retentionManager.ts  # Configurable retention policies
│   │   └── encryption.ts        # AES-256 encryption at rest
│   │
│   ├── notifications/
│   │   ├── emailSender.ts       # SendGrid / SMTP integration
│   │   ├── smsSender.ts         # Twilio SMS
│   │   ├── webhookDispatcher.ts # Outbound webhook events
│   │   └── templates/           # Email HTML templates
│   │       ├── signingRequest.html
│   │       ├── reminder.html
│   │       ├── completed.html
│   │       └── voided.html
│   │
│   └── db/
│       ├── schema.ts            # Drizzle ORM schema
│       ├── migrations/          # Database migrations
│       └── seed.ts              # Development seed data
│
├── signing-ui/                  # React app — the signer experience
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── SigningPage.tsx   # Document view + signing UX
│   │   │   ├── VerifyPage.tsx   # Identity verification step
│   │   │   ├── CompletePage.tsx # Post-signing confirmation
│   │   │   └── ExpiredPage.tsx  # Expired/voided envelope
│   │   ├── components/
│   │   │   ├── PDFViewer.tsx    # PDF rendering with field overlays
│   │   │   ├── SignatureField.tsx
│   │   │   ├── SignaturePad.tsx # Draw / type / upload signature
│   │   │   ├── DateField.tsx
│   │   │   ├── InitialField.tsx
│   │   │   └── ProgressBar.tsx  # Multi-field completion tracker
│   │   └── hooks/
│   │       ├── useEnvelope.ts
│   │       └── useSignature.ts
│   └── public/
│
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── docs/
    ├── API.md                   # REST API reference
    ├── DEPLOYMENT.md            # Production deployment guide
    ├── COMPLIANCE.md            # ESIGN, UETA, eIDAS guidance
    └── SECURITY.md              # Security model documentation
```

---

## Data Model

### Core Tables

```sql
-- An envelope is a signing request for one document
CREATE TABLE envelopes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status          TEXT NOT NULL DEFAULT 'draft',
        -- draft | sent | in_progress | completed | voided | expired
    document_key    TEXT NOT NULL,          -- S3 key for original document
    sealed_key      TEXT,                   -- S3 key for sealed final PDF
    completion_cert TEXT,                   -- S3 key for Certificate of Completion
    subject         TEXT,                   -- Email subject line
    message         TEXT,                   -- Message to signers
    signing_order   TEXT NOT NULL DEFAULT 'sequential',
        -- sequential | parallel
    expires_at      TIMESTAMPTZ,
    created_by      TEXT NOT NULL,          -- Sender identifier
    metadata        JSONB DEFAULT '{}',     -- Extensible metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each signer on an envelope
CREATE TABLE signers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id     UUID NOT NULL REFERENCES envelopes(id),
    email           TEXT NOT NULL,
    name            TEXT,
    role            TEXT DEFAULT 'signer',  -- signer | viewer | approver
    signing_order   INT NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'pending',
        -- pending | notified | opened | signed | declined
    token           TEXT UNIQUE NOT NULL,   -- Secure URL token
    token_expires   TIMESTAMPTZ NOT NULL,
    signed_at       TIMESTAMPTZ,
    signature_image TEXT,                   -- S3 key for captured signature
    ip_address      INET,
    user_agent      TEXT,
    geolocation     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Signature and form fields placed on the document
CREATE TABLE fields (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id     UUID NOT NULL REFERENCES envelopes(id),
    signer_id       UUID NOT NULL REFERENCES signers(id),
    type            TEXT NOT NULL,
        -- signature | initial | date | text | checkbox
    page            INT NOT NULL,
    x               FLOAT NOT NULL,        -- Position from left (%)
    y               FLOAT NOT NULL,        -- Position from top (%)
    width           FLOAT NOT NULL,        -- Field width (%)
    height          FLOAT NOT NULL,        -- Field height (%)
    required        BOOLEAN DEFAULT true,
    value           TEXT,                   -- Filled value after signing
    filled_at       TIMESTAMPTZ
);

-- Immutable audit trail
CREATE TABLE audit_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id     UUID NOT NULL REFERENCES envelopes(id),
    signer_id       UUID REFERENCES signers(id),
    event_type      TEXT NOT NULL,
        -- created | sent | opened | viewed | field_filled
        -- signed | declined | voided | expired | reminded
        -- sealed | downloaded | accessed
    ip_address      INET,
    user_agent      TEXT,
    geolocation     TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reusable templates
CREATE TABLE templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT,
    document_key    TEXT NOT NULL,          -- S3 key for template document
    field_config    JSONB NOT NULL,         -- Pre-configured field positions
    signer_roles    JSONB NOT NULL,         -- Role definitions
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_envelopes_status ON envelopes(status);
CREATE INDEX idx_envelopes_created_by ON envelopes(created_by);
CREATE INDEX idx_signers_envelope ON signers(envelope_id);
CREATE INDEX idx_signers_token ON signers(token);
CREATE INDEX idx_signers_email ON signers(email);
CREATE INDEX idx_fields_envelope ON fields(envelope_id);
CREATE INDEX idx_audit_envelope ON audit_events(envelope_id);
CREATE INDEX idx_audit_type ON audit_events(event_type);
CREATE INDEX idx_audit_created ON audit_events(created_at);
```

---

## API Endpoints

### Envelopes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/envelopes` | Create a new envelope (upload document, define signers and fields) |
| `GET` | `/api/envelopes/:id` | Get envelope status and details |
| `GET` | `/api/envelopes` | List envelopes (filterable by status, date, signer) |
| `POST` | `/api/envelopes/:id/send` | Send the envelope — triggers notifications to signers |
| `POST` | `/api/envelopes/:id/void` | Void a pending envelope |
| `POST` | `/api/envelopes/:id/remind` | Send reminder to unsigned signers |
| `GET` | `/api/envelopes/:id/audit` | Get full audit trail for an envelope |
| `GET` | `/api/envelopes/:id/download` | Download sealed PDF |
| `GET` | `/api/envelopes/:id/certificate` | Download Certificate of Completion |

### Signing Ceremony

| Method | Path | Description |
|---|---|---|
| `GET` | `/sign/:token` | Load the signing page for a signer (serves React UI) |
| `POST` | `/sign/:token/verify` | Submit identity verification (email code / SMS OTP) |
| `GET` | `/sign/:token/document` | Get the PDF for rendering in the signing UI |
| `POST` | `/sign/:token/fields/:fieldId` | Fill a field (signature, initial, date, text) |
| `POST` | `/sign/:token/complete` | Complete signing — signer confirms all fields are filled |
| `POST` | `/sign/:token/decline` | Decline to sign |

### Templates

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/templates` | Create a reusable template |
| `GET` | `/api/templates` | List templates |
| `GET` | `/api/templates/:id` | Get template details |
| `POST` | `/api/templates/:id/use` | Create an envelope from a template |
| `DELETE` | `/api/templates/:id` | Delete a template |

### Webhooks

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/webhooks` | Register a webhook URL |
| `GET` | `/api/webhooks` | List registered webhooks |
| `DELETE` | `/api/webhooks/:id` | Remove a webhook |

Webhook events: `envelope.sent`, `envelope.opened`, `envelope.signed`, `envelope.completed`, `envelope.declined`, `envelope.voided`, `envelope.expired`

---

## Signing Ceremony Flow

```
1. Sender creates envelope via API (or Claude /coseal:send)
   → Document uploaded and stored (encrypted)
   → Signers defined with email, name, order
   → Fields placed on document pages
   → Unique token generated per signer (UUID v4, 72hr expiry)

2. Envelope sent
   → Email sent to first signer (or all, if parallel)
   → Email contains: subject, message, secure link
   → Audit event: "sent"

3. Signer opens link (/sign/:token)
   → Token validated (exists, not expired, correct status)
   → Identity verification if configured (email code or SMS OTP)
   → Audit event: "opened" (with IP, user agent, timestamp)

4. Signer views document
   → PDF rendered in browser with field overlays
   → Signer works through required fields
   → Audit event: "viewed"

5. Signer fills fields
   → Signature: draw on canvas, type name, or upload image
   → Initials, dates, text fields
   → Each field fill logged
   → Audit event: "field_filled" per field

6. Signer completes
   → All required fields validated
   → Signer clicks "Finish" — final confirmation
   → Signature image + metadata stored
   → Audit event: "signed" (with IP, user agent, geo, timestamp)

7. Next signer notified (if sequential) or completion check (if parallel)
   → Repeat steps 3-6 for each signer

8. All signers complete → Envelope sealed
   → Final PDF generated with all signatures embedded
   → SHA-256 hash computed over entire document
   → X.509 digital certificate embedded in PDF
   → Certificate of Completion generated (PDF)
   → Audit event: "sealed"
   → Completion notification sent to all parties
   → Webhook fired: envelope.completed
```

---

## Cryptographic Sealing

When all parties have signed, CoSeal produces a tamper-evident sealed document:

1. **Flatten** — all signature images, initials, dates, and text fields are permanently embedded into the PDF.

2. **Hash** — the complete PDF byte stream is hashed with SHA-256, producing a unique fingerprint.

3. **Sign** — the hash is signed with the CoSeal instance's private key (RSA-2048 or ECDSA P-256), producing a digital signature.

4. **Embed** — the digital signature and X.509 certificate are embedded into the PDF's signature dictionary, following the PDF 2.0 / PAdES standard.

5. **Certificate of Completion** — a separate PDF is generated containing:
   - Document title and unique envelope ID
   - SHA-256 fingerprint of the sealed document
   - For each signer: name, email, IP address, timestamp, user agent
   - Full audit trail of all events
   - QR code linking to online verification

Anyone can verify the document's integrity by checking the embedded signature against the certificate, without needing CoSeal.

---

## Security Model

### In Transit
- All API endpoints require HTTPS (TLS 1.2+)
- Signing ceremony links are HTTPS-only
- MCP connection from Cowork plugin to service uses bearer token auth

### At Rest
- Documents encrypted with AES-256-GCM before storage
- Encryption keys managed via KMS (AWS KMS, GCP KMS, or local keyring)
- Database credentials stored in environment variables or secrets manager
- Signer tokens are cryptographically random (UUID v4) with configurable expiry

### Signing Ceremony
- Tokens are single-use per session and expire (default: 72 hours)
- Optional identity verification: email confirmation code, SMS OTP
- IP address and user agent captured with every action
- Rate limiting on all signing endpoints
- CSRF protection on form submissions

### Audit Trail
- Append-only: audit events cannot be modified or deleted via API
- Each event includes timestamp, IP, user agent, and event-specific metadata
- Exportable in PDF, JSON, and CSV formats for compliance audits

---

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/coseal
COSEAL_SIGNING_KEY_PATH=/path/to/private-key.pem
COSEAL_SIGNING_CERT_PATH=/path/to/certificate.pem

# Storage (S3-compatible)
S3_ENDPOINT=https://s3.amazonaws.com     # or MinIO, Backblaze, etc.
S3_BUCKET=coseal-documents
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_REGION=us-east-1

# Encryption
DOCUMENT_ENCRYPTION_KEY=base64-encoded-256-bit-key
# Or use KMS:
# KMS_KEY_ID=arn:aws:kms:us-east-1:123456789:key/abc-123

# Notifications
SENDGRID_API_KEY=SG.xxxxx                # or SMTP_* for direct SMTP
TWILIO_ACCOUNT_SID=AC_xxxxx              # optional, for SMS
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890

# Service
COSEAL_BASE_URL=https://sign.yourdomain.com
COSEAL_API_KEY=your-api-key              # for MCP/API auth
PORT=3000

# Optional
SIGNING_LINK_EXPIRY_HOURS=72
REMINDER_INTERVAL_HOURS=24
DEFAULT_RETENTION_DAYS=2555               # ~7 years
LOG_LEVEL=info
```

---

## Deployment Options

### Development
```bash
git clone https://github.com/coseal-sign/coseal-service.git
cd coseal-service
cp .env.example .env
docker-compose up
# Service: http://localhost:3000
# Signing UI: http://localhost:3001
```

### Production (Docker)
- Use managed PostgreSQL (RDS, Cloud SQL, Supabase)
- Use S3 or equivalent for document storage
- Use AWS KMS / GCP KMS for encryption key management
- Put behind a reverse proxy (nginx, Caddy) with TLS
- Set `COSEAL_BASE_URL` to your public domain

### Production (Kubernetes)
- Helm chart provided in `/deploy/helm/`
- Horizontal scaling for the API and signing UI
- PostgreSQL via operator (CloudNativePG) or managed service
- Ingress controller for TLS termination

---

## Integration with Cowork Legal Plugin

CoSeal is designed as a natural extension of the Legal plugin workflow:

```
Legal Plugin                          CoSeal Plugin
────────────                          ─────────────
/review-contract                      
  → Clause-by-clause review           
  → RED/YELLOW/GREEN flags             
  → Redline suggestions               
                                      
/triage-nda                           
  → Standard / Counsel / Full review  
                                      
User approves final document ────────▶ /coseal:send
                                        → Upload document
                                        → Define signers
                                        → Place fields
                                        → Send for signature
                                      
                                      /coseal:status
                                        → Track signing progress
                                      
                                      /coseal:remind
                                        → Nudge unsigned parties
                                      
                                      /coseal:download
                                        → Get sealed PDF + cert
                                        → File to workspace
```

The Legal plugin's skills teach Claude about contract structure. CoSeal's skills teach Claude about the signing process. Together, they give Claude the full context to manage a contract from first review to final execution.

---

## License

Apache 2.0
