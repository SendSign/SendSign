# Changelog

All notable changes to CoSeal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-09

### Added — Steps 29-32

#### Document Generation / Mail Merge (Step 29)
- `POST /api/envelopes/generate` — Create envelope with merged template data
- `POST /api/envelopes/bulk` — Bulk send with per-recipient merge data
- `POST /api/envelopes/bulk/csv` — CSV upload for bulk merge and send
- `GET /api/envelopes/bulk/:batchId/status` — Track bulk send progress
- Mail merge module with PDF and DOCX template support
- CSV parsing for bulk data import

#### Enhanced Analytics (Step 30)
- `GET /api/admin/analytics` enhanced with `userId`, `dateFrom`, `dateTo`, `groupBy` filters
- `GET /api/admin/analytics/users` — Per-user analytics breakdown
- `GET /api/admin/analytics/templates` — Per-template usage statistics
- `GET /api/admin/analytics/export` — CSV export for analytics data

#### CoSeal for Salesforce (Step 31)
- Complete Salesforce managed package (`salesforce/` directory)
- Apex classes: CoSealService, CoSealEnvelopeController, CoSealWebhookHandler, CoSealConfig
- LWC components: Send Button, Signing Embed (iframe), Envelope Status, Admin Config
- Custom settings for API URL/Key, field mapping metadata, permission sets
- `POST /api/envelopes/:id/embedded-signing` — Embedded signing URL for iframes
- CORS configuration for Salesforce domains
- Apex test classes with HTTP callout mocking (75%+ coverage)

#### White-Label Branding (Step 32)
- `branding_config` schema table for full branding customization
- `GET /api/admin/branding` — Read branding configuration
- `PUT /api/admin/branding` — Update branding (requires entitlement)
- `DELETE /api/admin/branding` — Reset to defaults
- CoSealBranding.tsx updated for three modes: default, clean white-label, custom
- Email templates inject branding variables (logo, colors, footer)
- Certificate of Completion uses custom company name
- CSS custom properties for color theming (`--coseal-primary`, etc.)
- Input validation: hex colors, logo size limits, CSS sanitization

---

## [1.0.0] - 2026-02-08

### 🚀 Initial Release

CoSeal v1.0.0 is feature-complete and production-ready. This release includes everything needed to replace commercial e-signature platforms like DocuSign with a self-hosted, open-source alternative.

### Core Signing Engine

- ✅ Document preparation with drag-and-drop signature field placement
- ✅ Multi-party signing with sequential, parallel, and conditional routing
- ✅ Secure tokenized signing ceremony with unique links per signer
- ✅ Signature capture via draw, type, or upload (camera support on mobile)
- ✅ SHA-256 document hashing with X.509 cryptographic sealing
- ✅ Certificate of Completion with full audit trail
- ✅ Template management for reusable document types
- ✅ Bulk send from templates
- ✅ In-person signing mode
- ✅ PowerForms for public-facing signature collection
- ✅ Multi-document envelopes with per-signer visibility control
- ✅ Envelope correction (update signer email, invalidate old tokens)

### Field Types

- ✅ Signature and initial fields
- ✅ Date, text, number, currency fields
- ✅ Checkbox, radio, dropdown fields
- ✅ Conditional fields (show/hide based on other field values)
- ✅ Calculated fields (formulas)
- ✅ Attachment upload fields
- ✅ Field validation (email, phone, ZIP, custom patterns)
- ✅ Anchor tag auto-placement (`/sig/`, `/date/`)

### Notifications

- ✅ Email notifications via SendGrid (with SMTP fallback)
- ✅ SMS notifications via Twilio
- ✅ WhatsApp notifications (Twilio)
- ✅ Webhook callbacks for envelope events
- ✅ Automated reminder scheduling
- ✅ Envelope expiry with notifications

### Compliance

- ✅ ESIGN Act (US) and UETA (49 states) compliant
- ✅ eIDAS Simple Electronic Signatures (SES)
- ✅ eIDAS Advanced Electronic Signatures (AES):
  - Two-factor authentication (email + SMS)
  - Government ID verification (Jumio, Onfido)
  - SSO/SAML considered AES-level
- ✅ eIDAS Qualified Electronic Signatures (QES):
  - Trust Service Provider integration (Swisscom AIS, Namirial)
  - QSCD (Qualified Signature Creation Device) support
  - Qualified certificates embedded in PDF
- ✅ Document retention policies:
  - Industry presets: HIPAA (7y), SEC/FINRA (7y), IRS (7y), Employment (5y), GDPR (1y)
  - Custom policies with auto-delete or manual review
  - Daily retention processing cron job
  - Retention report generation (PDF)

### Enterprise

- ✅ Multi-tenant architecture with organization isolation
- ✅ Plan tiers: Free (5 env/mo), Pro (100 env/mo), Enterprise (unlimited)
- ✅ API key management per organization (SHA-256 hashed)
- ✅ Plan enforcement (envelope limits, feature gates)
- ✅ Enterprise SSO with SAML 2.0 and OpenID Connect
- ✅ Multi-tenant SSO configuration (per-organization IdP)
- ✅ Admin analytics dashboard (React)
- ✅ Usage tracking and reporting API

### Ecosystem Integrations

- ✅ **Slack** — Real-time signing notifications with interactive messages
- ✅ **Microsoft 365 / SharePoint** — Auto-upload completed documents via Microsoft Graph
- ✅ **Google Drive** — Auto-upload via service account
- ✅ **Box** — Auto-upload to Box folders
- ✅ **Egnyte** — Auto-upload for financial services teams
- ✅ **Jira** — Create tickets, add comments, attach completed documents

### Security

- ✅ Document encryption at rest (AES-256-GCM)
- ✅ Encrypted storage keys (envelope-specific)
- ✅ KMS support (AWS KMS, GCP KMS)
- ✅ TLS 1.3 for all network traffic
- ✅ Rate limiting (per-IP and per-API-key)
- ✅ Input sanitization and validation (zod)
- ✅ Security headers (helmet.js)
- ✅ Immutable audit log with IP address tracking

### Developer Experience

- ✅ **TypeScript SDK** (`@coseal/sdk`):
  - Node.js and browser support
  - Full type definitions
  - Custom error classes
  - Embeddable signing UI component
  - Dual CJS/ESM build
- ✅ **REST API** with consistent JSON responses
- ✅ **Comprehensive documentation** (API, Deployment, Compliance, Security)
- ✅ **Helm chart** for Kubernetes deployment
- ✅ **Terraform modules** for AWS (EKS, RDS, S3) and GCP (GKE, Cloud SQL, GCS)
- ✅ **Raw K8s manifests** for users who don't want Helm
- ✅ **Docker Compose** for local development
- ✅ **Zero-config setup script** (`scripts/setup.sh`)
- ✅ **E2E integration test suite** (`scripts/e2e-test.ts`)

### Mobile Optimization

- ✅ Mobile-responsive signing UI
- ✅ Touch-optimized signature pad (full-screen modal)
- ✅ Pinch-to-zoom for PDF viewing
- ✅ Bottom-sheet field navigator
- ✅ Progressive Web App (PWA) support
- ✅ Safe area handling for notched devices
- ✅ Camera capture for signature upload

### Cowork Plugin

- ✅ Plugin manifest and MCP connector
- ✅ 9 commands: send, status, remind, void, download, templates, bulk-send, analytics, retention
- ✅ 6 skills: signing workflow, field placement, signer routing, audit compliance, retention compliance, ecosystem integrations

### Infrastructure

- ✅ Production-ready Dockerfile (multi-stage build)
- ✅ Docker Compose for production deployments
- ✅ Horizontal Pod Autoscaler (HPA) for Kubernetes
- ✅ Pod Disruption Budget (PDB) for high availability
- ✅ CronJob definitions for retention, reminders, expiry
- ✅ Health check endpoints for liveness/readiness probes
- ✅ CloudWatch and Cloud Monitoring integration

### CI/CD

- ✅ GitHub Actions workflow:
  - Linting (ESLint, Prettier)
  - Type checking (TypeScript strict mode)
  - Unit tests (Vitest)
  - Docker image build
  - SDK build and test

---

## Support

- **Documentation:** [https://github.com/coseal/coseal](https://github.com/coseal/coseal)
- **Issues:** [https://github.com/coseal/coseal/issues](https://github.com/coseal/coseal/issues)
- **Enterprise support:** Contact info (TBD)