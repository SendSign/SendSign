# CoSeal Build Recipe

> **Instructions for AI coding agent:** Follow this recipe from top to bottom, completing each step fully before moving to the next. After completing each step, run the verification check listed. Do not skip steps. Do not partially complete steps. Update CLAUDE.md STATUS after each step.

> **Reference documents:** `ARCHITECTURE.md` contains the full technical specification including database schema, API endpoints, file structure, and signing flow. `README.md` contains the product context. Consult both as needed.

---

## Step 1: Project Scaffold

**Goal:** Create the complete project structure with all directories, config files, and empty typed stubs.

### Tasks:
1. Initialize the Node.js project:
   - `package.json` with name `coseal-service`, version `0.1.0`
   - TypeScript 5+, Node 20+
   - Dependencies: express, drizzle-orm, drizzle-kit, pg, node-forge, pdf-lib, zod, uuid, cors, helmet, express-rate-limit, dotenv, node-cron
   - Dev dependencies: typescript, tsx, vitest, @types/express, @types/pg, @types/uuid, @types/cors, @types/node, axe-core
   - Scripts: `dev`, `build`, `start`, `db:generate`, `db:migrate`, `db:push`, `test`

2. Create `tsconfig.json` — strict mode, ES2022 target, NodeNext module resolution

3. Create the full directory structure from ARCHITECTURE.md:
   ```
   src/
     index.ts
     config/index.ts
     api/routes/ (envelopes.ts, signing.ts, templates.ts, webhooks.ts, health.ts)
     api/middleware/ (auth.ts, rateLimit.ts, validate.ts)
     documents/ (pdfRenderer.ts, fieldPlacer.ts, templateEngine.ts, merger.ts, fieldTypes.ts, fieldLogic.ts, fieldValidation.ts, anchorTags.ts)
     workflow/ (envelopeManager.ts, signingOrder.ts, reminderScheduler.ts, expiryManager.ts, bulkSender.ts, envelopeCorrector.ts)
     ceremony/ (tokenGenerator.ts, identityVerifier.ts, signatureCapture.ts)
     crypto/ (hasher.ts, sealer.ts, certManager.ts, completionCert.ts)
     audit/ (auditLogger.ts, eventTypes.ts, exporters.ts)
     storage/ (documentStore.ts, retentionManager.ts, encryption.ts)
     notifications/ (emailSender.ts, smsSender.ts, whatsappSender.ts, webhookDispatcher.ts)
     notifications/templates/ (signingRequest.html, reminder.html, completed.html, voided.html)
     db/ (schema.ts, seed.ts)
     db/migrations/
   ```

4. Each `.ts` file should contain:
   - The correct imports (even if imported modules are stubs)
   - Exported type interfaces for what the module will handle
   - Exported stub functions that throw `new Error('Not implemented: [functionName]')` with correct type signatures
   - This ensures the project type-checks from the start

5. Create `.env.example` from the environment variables in ARCHITECTURE.md. Also include:
   ```bash
   # WhatsApp (via Twilio — optional)
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

   # Branding entitlement (optional — for white-label deployments)
   # Without this key, CoSeal branding is displayed and cannot be removed.
   # Contact enterprise@coseal.dev for entitlement keys.
   COSEAL_BRANDING_ENTITLEMENT=
   ```

6. Create `Dockerfile` — multi-stage build (build stage + production stage with node:20-slim)

7. Create `docker-compose.yml` from ARCHITECTURE.md (api, db, signing-ui placeholder)

8. Create `.gitignore` (node_modules, dist, .env, *.pem, pgdata)

### Verification:
```bash
npm install
npx tsc --noEmit  # Must pass with zero errors
```

### On completion:
Update CLAUDE.md STATUS to: **Step 1 complete — Scaffold built, types check**

---

## Step 2: Database Schema + Migrations

**Goal:** Implement the full database schema with Drizzle ORM and create migrations.

### Tasks:
1. Implement `src/db/schema.ts` using Drizzle ORM — translate the SQL schema from ARCHITECTURE.md:
   - `envelopes` table with all columns and the status enum. Add `signing_mode` column: `remote` (default) | `in_person`. Add `routing_rules` column (JSONB, nullable) for conditional routing logic. Add `is_powerform` boolean (default false) for self-service public signing links.
   - `documents` table (NEW — supports multi-document envelopes):
     ```
     id              UUID PRIMARY KEY
     envelope_id     UUID NOT NULL REFERENCES envelopes(id)
     filename        TEXT NOT NULL
     content_type    TEXT NOT NULL DEFAULT 'application/pdf'
     storage_path    TEXT NOT NULL
     document_hash   TEXT NOT NULL
     order           INT NOT NULL DEFAULT 0
     visibility      TEXT[] DEFAULT ARRAY['all']  -- signer IDs who can see this doc, or ['all']
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
     ```
     This replaces the single-document-per-envelope model. Fields reference a `document_id` in addition to `envelope_id`.
   - `signers` table with all columns, foreign key to envelopes. Add `notification_channel` column: `email` (default) | `sms` | `whatsapp`. Add `signing_group` INT (nullable) for mixed routing — signers in the same group sign in parallel, groups execute sequentially.
   - `fields` table with all columns, foreign keys to envelopes and signers. Add `document_id` UUID FK to documents table. Expand `type` enum to include: `signature`, `initial`, `date`, `text`, `checkbox`, `radio`, `dropdown`, `number`, `currency`, `calculated`, `attachment`. Add columns: `options` (JSONB — for radio/dropdown option lists), `formula` (TEXT — for calculated fields), `conditional_rules` (JSONB — array of show/hide conditions), `linked_group_id` (TEXT — for linked field groups), `validation_rules` (JSONB — phone, ZIP, regex, etc.), `anchor_text` (TEXT, nullable — for AutoPlace positioning)
   - `audit_events` table with all columns, foreign key to envelopes
   - `templates` table with all columns
   - All indexes from the schema

2. Implement `src/config/index.ts`:
   - Load environment variables with dotenv
   - Validate all required env vars with zod at startup
   - Export a typed `config` object
   - Fail fast with clear error messages for missing vars

3. Create a `drizzle.config.ts` at project root for Drizzle Kit

4. Generate the initial migration with `drizzle-kit generate`

5. Create a database connection module that exports a drizzle client instance

6. Implement `src/db/seed.ts` — creates sample data for development:
   - 1 completed envelope with 2 signers, fields, and audit events
   - 1 in-progress envelope with 1 signed signer and 1 pending
   - 1 template

### Verification:
```bash
docker-compose up db -d
npm run db:push  # Or db:migrate — schema must apply cleanly
npx tsx src/db/seed.ts  # Seed must run without errors
```

### On completion:
Update CLAUDE.md STATUS to: **Step 2 complete — Database schema live, seed data working**

---

## Step 3: Audit Logger

**Goal:** Build the audit trail system first because every subsequent module depends on it.

### Tasks:
1. Implement `src/audit/eventTypes.ts`:
   - Define a TypeScript union type for all event types: `created | sent | opened | viewed | field_filled | signed | declined | voided | expired | reminded | sealed | downloaded | accessed`
   - Define the `AuditEvent` interface matching the database table
   - Define a `CreateAuditEvent` input type (without id and created_at)

2. Implement `src/audit/auditLogger.ts`:
   - `logEvent(event: CreateAuditEvent): Promise<AuditEvent>` — inserts into audit_events table
   - `getEventsForEnvelope(envelopeId: string): Promise<AuditEvent[]>` — returns all events for an envelope, ordered by created_at
   - `getEventsForSigner(signerId: string): Promise<AuditEvent[]>`
   - All functions are async and use Drizzle ORM
   - The logger should never throw — wrap in try/catch and log failures to stderr

3. Implement `src/audit/exporters.ts`:
   - `exportAsJSON(envelopeId: string): Promise<string>` — full audit trail as formatted JSON
   - `exportAsCSV(envelopeId: string): Promise<string>` — CSV with headers
   - Leave `exportAsPDF` as a stub for now (will implement after crypto module)

4. Write tests in `src/audit/auditLogger.test.ts`:
   - Test event creation
   - Test event retrieval by envelope
   - Test that events are ordered chronologically
   - Use a test database or mock the Drizzle client

### Verification:
```bash
npm test -- src/audit/
```

### On completion:
Update CLAUDE.md STATUS to: **Step 3 complete — Audit logger operational, tested**

---

## Step 4: Storage + Encryption

**Goal:** Implement encrypted document storage so envelopes and signing can store/retrieve files.

### Tasks:
1. Implement `src/storage/encryption.ts`:
   - `encrypt(data: Buffer, key: Buffer): Promise<{ encrypted: Buffer, iv: Buffer, tag: Buffer }>` — AES-256-GCM
   - `decrypt(encrypted: Buffer, key: Buffer, iv: Buffer, tag: Buffer): Promise<Buffer>`
   - Key derivation helper if using a passphrase instead of raw key
   - Tests for encrypt → decrypt round-trip

2. Implement `src/storage/documentStore.ts`:
   - Use the AWS SDK v3 S3 client (works with any S3-compatible service including MinIO)
   - `uploadDocument(data: Buffer, metadata?: Record<string, string>): Promise<string>` — encrypts, uploads, returns S3 key
   - `downloadDocument(key: string): Promise<Buffer>` — downloads, decrypts, returns buffer
   - `deleteDocument(key: string): Promise<void>`
   - `getSignedUrl(key: string, expiresIn?: number): Promise<string>` — for direct browser access if needed
   - All documents are encrypted before upload using the encryption module

3. Implement `src/storage/retentionManager.ts`:
   - `checkExpiredDocuments(): Promise<string[]>` — finds documents past their retention period
   - `purgeExpired(): Promise<number>` — deletes expired documents, returns count
   - Configurable retention period from environment variable (default 7 years / 2555 days)

4. Add MinIO to `docker-compose.yml` as the local S3-compatible service for development

### Verification:
```bash
docker-compose up db minio -d
npm test -- src/storage/
```

### On completion:
Update CLAUDE.md STATUS to: **Step 4 complete — Encrypted storage operational**

---

## Step 5: Document Processing

**Goal:** Implement PDF handling — parsing, field placement, signature embedding, and document merging.

### Tasks:
1. Implement `src/documents/pdfRenderer.ts`:
   - `parsePdf(data: Buffer): Promise<{ pageCount: number, pages: PageInfo[] }>` — extract basic PDF info using pdf-lib
   - `renderPageAsImage(data: Buffer, pageNum: number): Promise<Buffer>` — for the signing UI to display pages (use pdf-lib to extract, or serve the PDF directly and let PDF.js handle rendering client-side)
   - `getPdfMetadata(data: Buffer): Promise<Record<string, string>>`

2. Implement `src/documents/fieldPlacer.ts`:
   - `placeFields(pdfData: Buffer, fields: FieldPlacement[]): Promise<Buffer>` — overlay visual field indicators (dotted boxes, labels) onto the PDF for the signing UI
   - `embedSignature(pdfData: Buffer, field: FieldPlacement, signatureImage: Buffer): Promise<Buffer>` — permanently embed a signature image at the specified position
   - `embedText(pdfData: Buffer, field: FieldPlacement, text: string): Promise<Buffer>` — embed date, text, initials
   - `flattenFields(pdfData: Buffer): Promise<Buffer>` — make all embedded content permanent (not editable)
   - All position coordinates are percentages (0-100) relative to page dimensions

3. Implement `src/documents/merger.ts`:
   - `applyAllFields(pdfData: Buffer, filledFields: FilledField[]): Promise<Buffer>` — takes the original PDF and all filled field data, produces the final document with everything embedded
   - This is the function called when all signers are done, before crypto sealing

4. Implement `src/documents/anchorTags.ts` — AutoPlace field positioning:
   - `findAnchorPositions(pdfData: Buffer, anchorText: string): AnchorMatch[]` — scans PDF text layer for anchor strings (e.g., `/sig/`, `/initial/`, `/date/`, `/name/`) and returns page, x, y coordinates of each match
   - `autoPlaceFields(pdfData: Buffer, anchorConfig: AnchorFieldConfig[]): FieldPlacement[]` — given a list of anchor text → field type mappings, automatically generates field placements at the correct positions
   - Supports offset from anchor position: `{ anchor: '/sig/', fieldType: 'signature', offsetX: 0, offsetY: 20, width: 200, height: 50 }`
   - This eliminates manual coordinate entry — senders just put text markers in their Word/PDF templates and CoSeal places fields automatically
   - If anchor text is found multiple times, a field is placed at each occurrence (useful for initials on every page)

5. Implement `src/documents/templateEngine.ts`:
   - `createTemplate(pdfData: Buffer, fieldConfig: FieldConfig[], signerRoles: SignerRole[]): Promise<Template>`
   - `instantiateTemplate(template: Template, signers: SignerInfo[]): Promise<{ pdfData: Buffer, fields: FieldPlacement[] }>`

5. Implement expanded field types in `src/documents/fieldTypes.ts`:
   - **Core types** (already planned): `signature`, `initial`, `date`, `text`, `checkbox`
   - **New types to add:**
     - `radio` — radio button group with named group ID and value per option
     - `dropdown` — select from predefined options list stored in field config
     - `number` — numeric input with optional min/max/decimal constraints
     - `currency` — number formatted as currency with configurable symbol/locale
     - `calculated` — auto-computed from other fields via formula expression (e.g., `{field_a} + {field_b} * 0.1`). Formula parser supports `+`, `-`, `*`, `/`, field references by ID, and numeric literals.
     - `attachment` — signer can upload a file (image or PDF) that gets embedded
   - Each field type defines: `type`, `required`, `validationRules`, `defaultValue`, `options` (for radio/dropdown), `formula` (for calculated), `groupId` (for radio)

6. Implement field logic in `src/documents/fieldLogic.ts`:
   - **Conditional fields**: `conditionalRules` on any field — array of `{ sourceFieldId, operator ('eq'|'neq'|'gt'|'lt'|'contains'|'empty'), value, action ('show'|'hide'|'require') }`. When source field value matches condition, target field is shown/hidden/required.
   - **Calculated fields**: `evaluateFormula(formula: string, fieldValues: Record<string, any>): number` — safely evaluate arithmetic expressions referencing other field values. No `eval()` — use a simple recursive descent parser or mathjs.
   - **Linked fields**: `linkedGroupId` on fields — when any field in the group is changed, all others with the same `linkedGroupId` update to match. Useful for name/title fields that appear on multiple pages.
   - Write a `resolveFieldState(allFields: Field[], currentValues: Record<string, any>): ResolvedField[]` function that computes visibility, required status, and calculated values for all fields given current input.

7. Implement expanded data validation in `src/documents/fieldValidation.ts`:
   - Existing: `text`, `email`, `date`
   - **Add:** `phone` (E.164 format), `zipCode5` (US 5-digit), `zipCode9` (US 9-digit ZIP+4), `ssn` (XXX-XX-XXXX format — mask on display), `url`, `regex` (custom pattern stored in field config)
   - `validateFieldValue(value: string, fieldType: FieldType, validationRules: ValidationRule[]): { valid: boolean, errors: string[] }`
   - Validation runs both client-side (signing UI) and server-side (API) — never trust client only

8. Write tests — especially for field placement coordinates, signature embedding, conditional field resolution, calculated field evaluation, and validation rules. Create a simple test PDF for use in tests.

### Verification:
```bash
npm test -- src/documents/
# Manually verify: create a test script that takes a sample PDF,
# places a signature field, embeds a signature image, and outputs the result.
# The output PDF should open in any PDF viewer with the signature visible.
```

### On completion:
Update CLAUDE.md STATUS to: **Step 5 complete — PDF processing and field placement working**

---

## Step 6: Cryptographic Sealing

**Goal:** Implement the crypto module that produces tamper-evident, independently verifiable signed PDFs.

### Tasks:
1. Implement `src/crypto/certManager.ts`:
   - `loadSigningKey(path: string): Promise<forge.pki.PrivateKey>` — load PEM private key
   - `loadCertificate(path: string): Promise<forge.pki.Certificate>` — load PEM certificate
   - `generateSelfSignedCert(): Promise<{ privateKey: string, certificate: string }>` — for development/self-hosted instances that don't have a CA-issued cert
   - On startup, if no cert exists at the configured path, auto-generate a self-signed one and warn

2. Implement `src/crypto/hasher.ts`:
   - `hashDocument(data: Buffer): string` — SHA-256, returns hex string
   - `verifyHash(data: Buffer, expectedHash: string): boolean`

3. Implement `src/crypto/sealer.ts`:
   - `sealDocument(pdfData: Buffer, privateKey: forge.pki.PrivateKey, certificate: forge.pki.Certificate): Promise<Buffer>`
   - This is the critical function. It must:
     a. Compute SHA-256 hash of the flattened PDF
     b. Create a PKCS#7 detached signature using the private key
     c. Embed the signature into the PDF's signature dictionary following PAdES baseline profile
     d. Embed the X.509 certificate for verification
     e. Return the sealed PDF
   - Use pdf-lib for PDF structure manipulation and node-forge for crypto operations
   - If full PAdES embedding proves too complex for v0.1, an acceptable fallback is:
     a. Compute SHA-256 hash
     b. Sign the hash with the private key
     c. Append the signature + cert as a PDF attachment or metadata entry
     d. Document this as a known limitation with PAdES planned for Phase 2

4. Implement `src/crypto/completionCert.ts`:
   - `generateCompletionCertificate(envelope: EnvelopeWithDetails): Promise<Buffer>` — produces a PDF containing:
     - Title: "Certificate of Completion"
     - CoSeal logo and "Powered by CoSeal" in header (subject to branding entitlement — see LICENSE)
     - Envelope ID, document title, creation date
     - Document SHA-256 fingerprint
     - Table of all signers: name, email, IP, timestamp, status
     - Full audit trail from the audit logger
     - CoSeal version and instance identifier
   - Use pdf-lib to create this PDF from scratch (no template needed)

5. Write a `scripts/generate-dev-cert.ts` that generates a self-signed cert for development and saves it to `./certs/`

6. Write thorough tests:
   - Hash consistency (same input = same hash)
   - Seal → verify round-trip
   - Completion certificate generation with sample data
   - Test that modifying a sealed PDF invalidates the signature

### Verification:
```bash
npm test -- src/crypto/
npx tsx scripts/generate-dev-cert.ts
# Verify: the generated cert files exist and are valid PEM
```

### On completion:
Update CLAUDE.md STATUS to: **Step 6 complete — Crypto sealing operational, certs generating**

---

## Step 7: Workflow Engine

**Goal:** Implement envelope lifecycle management, signing order logic, reminders, and expiry.

### Tasks:
1. Implement `src/workflow/envelopeManager.ts`:
   - `createEnvelope(input: CreateEnvelopeInput): Promise<Envelope>` — create envelope, signers, fields in a transaction. Log audit event `created`.
   - `sendEnvelope(envelopeId: string): Promise<void>` — validate all required fields exist, generate tokens for signers, trigger notifications. Log audit event `sent`. Update status to `sent`.
   - `voidEnvelope(envelopeId: string, reason?: string): Promise<void>` — cancel a pending envelope. Log audit event `voided`. Update status to `voided`.
   - `completeEnvelope(envelopeId: string): Promise<void>` — called when all signers are done. Merge all signatures into PDF, seal it cryptographically, generate completion cert, store sealed docs, notify all parties. Log audit event `sealed`. Update status to `completed`.
   - `getEnvelope(envelopeId: string): Promise<EnvelopeWithDetails>` — returns envelope with signers, fields, and latest status
   - `listEnvelopes(filters: EnvelopeFilters): Promise<{ envelopes: Envelope[], total: number }>`

2. Implement `src/workflow/signingOrder.ts`:
   - `getNextSigners(envelope: EnvelopeWithDetails): Signer[]` — based on signing_order (sequential, parallel, or mixed), returns who should be notified next
   - `canSignerSign(signer: Signer, envelope: EnvelopeWithDetails): boolean` — checks if it's this signer's turn
   - `onSignerCompleted(signerId: string, envelopeId: string): Promise<void>` — after a signer signs, determine if the envelope is complete or if next signers should be notified
   - **Conditional routing**: `evaluateRoutingRules(envelope: EnvelopeWithDetails, completedSigner: Signer, fieldValues: Record<string, any>): RoutingDecision` — after a signer completes, evaluate routing rules stored in `envelope.routing_rules` (JSONB). Rules support:
     - `{ condition: 'field_value', fieldId: 'xyz', operator: 'eq', value: 'Declined', action: 'skip_to', targetSignerOrder: 3 }` — skip signers based on field values
     - `{ condition: 'signer_declined', action: 'route_to', targetSignerOrder: 4 }` — re-route if a signer declines
     - `{ condition: 'field_value', fieldId: 'amount', operator: 'gt', value: '10000', action: 'add_signer', signerEmail: 'cfo@company.com' }` — add approval signer for high-value contracts
   - Mixed routing: support groups of parallel signers within a sequential flow (e.g., signers 1+2 sign in parallel, then signer 3, then signers 4+5 in parallel). Use `signing_group` integer on signers — same group signs in parallel, groups execute sequentially.

3. Implement `src/workflow/envelopeCorrector.ts` — in-flight envelope modification:
   - `correctEnvelope(envelopeId: string, corrections: EnvelopeCorrection): Promise<void>` — modify a sent (but not completed) envelope
   - Supported corrections: update signer email/name, add/remove signers, add/remove/reposition fields, add/remove documents
   - When corrected: void all outstanding signing tokens → regenerate new tokens → re-notify affected signers
   - Log audit event `corrected` with diff of what changed
   - Signers who already completed are NOT affected (their signatures remain)

4. Implement `src/ceremony/tokenGenerator.ts`:
   - `generateSigningToken(): string` — UUID v4
   - `generateTokenExpiry(hours?: number): Date` — default 72 hours from now
   - `validateToken(token: string): Promise<{ valid: boolean, signer?: Signer, reason?: string }>`

4. Implement `src/workflow/reminderScheduler.ts`:
   - `scheduleReminders(): void` — cron job (using node-cron) that runs every hour
   - Finds signers who were notified but haven't signed, and whose last reminder was > REMINDER_INTERVAL_HOURS ago
   - Sends reminder notification, logs audit event `reminded`

5. Implement `src/workflow/expiryManager.ts`:
   - `checkExpiredEnvelopes(): Promise<void>` — cron job that runs every hour
   - Finds envelopes past their `expires_at` that aren't completed/voided
   - Updates status to `expired`, logs audit event, notifies sender

6. Write tests for:
   - Sequential signing order: signer 2 cannot sign before signer 1
   - Parallel signing: all signers can sign in any order
   - Envelope completion triggers sealing
   - Token validation (valid, expired, already used)
   - Reminder scheduling logic

### Verification:
```bash
npm test -- src/workflow/ src/ceremony/
```

### On completion:
Update CLAUDE.md STATUS to: **Step 7 complete — Workflow engine with signing order, reminders, expiry**

---

## Step 8: Notifications

**Goal:** Implement email and SMS notifications for every stage of the signing lifecycle.

### Tasks:
1. Implement `src/notifications/emailSender.ts`:
   - `sendSigningRequest(signer: Signer, envelope: Envelope, signingUrl: string): Promise<void>`
   - `sendReminder(signer: Signer, envelope: Envelope, signingUrl: string): Promise<void>`
   - `sendCompleted(signer: Signer, envelope: Envelope, downloadUrl: string): Promise<void>`
   - `sendVoided(signer: Signer, envelope: Envelope, reason?: string): Promise<void>`
   - `sendDeclined(sender: string, signer: Signer, envelope: Envelope, reason?: string): Promise<void>`
   - Use SendGrid SDK as primary, with raw SMTP as fallback (configurable)
   - All emails use HTML templates from `src/notifications/templates/`

2. Create the HTML email templates:
   - `signingRequest.html` — "You have a document to sign" with prominent "Review & Sign" button
   - `reminder.html` — "Reminder: document waiting for your signature"
   - `completed.html` — "Document fully executed" with "Download" button
   - `voided.html` — "Signing request cancelled"
   - Templates should be clean, mobile-responsive, and professional
   - All templates include "Powered by CoSeal" footer with CoSeal logo (subject to branding entitlement — see LICENSE)
   - Use template variables: `{{signerName}}`, `{{senderName}}`, `{{documentTitle}}`, `{{signingUrl}}`, `{{message}}`

3. Implement `src/notifications/smsSender.ts`:
   - `sendSmsOtp(phone: string, code: string): Promise<void>` — for identity verification
   - `sendSmsNotification(phone: string, message: string): Promise<void>` — optional signing notifications
   - Use Twilio SDK
   - Gracefully degrade if Twilio is not configured (log warning, skip)

4. Implement `src/notifications/whatsappSender.ts`:
   - `sendWhatsAppSigningRequest(phone: string, signerName: string, documentTitle: string, signingUrl: string): Promise<void>` — uses Twilio WhatsApp Business API
   - `sendWhatsAppReminder(phone: string, signerName: string, documentTitle: string, signingUrl: string): Promise<void>`
   - `sendWhatsAppCompleted(phone: string, signerName: string, documentTitle: string): Promise<void>`
   - Use pre-approved WhatsApp message templates (Twilio requires template approval)
   - Config: `TWILIO_WHATSAPP_FROM` (e.g., `whatsapp:+14155238886`)
   - Gracefully degrade if WhatsApp is not configured (fall back to SMS, then email-only)
   - Signer notification preference stored in `signers.notification_channel` column: `email` (default) | `sms` | `whatsapp`

5. Implement `src/notifications/webhookDispatcher.ts`:
   - `registerWebhook(url: string, events: string[]): Promise<Webhook>`
   - `removeWebhook(id: string): Promise<void>`
   - `dispatch(event: string, payload: any): Promise<void>` — POST to all registered webhooks matching the event
   - Include HMAC signature header for webhook verification
   - Retry failed deliveries up to 3 times with exponential backoff

6. Implement `src/ceremony/identityVerifier.ts`:
   - `sendEmailVerification(email: string): Promise<string>` — generate 6-digit code, send via email, return hashed code for comparison
   - `sendSmsVerification(phone: string): Promise<string>` — same via SMS
   - `verifyCode(inputCode: string, hashedCode: string): boolean`
   - Codes expire after 10 minutes

### Verification:
```bash
npm test -- src/notifications/ src/ceremony/identityVerifier
# Manual test: send a test email using a script that calls sendSigningRequest
```

### On completion:
Update CLAUDE.md STATUS to: **Step 8 complete — Email, SMS, webhook notifications working**

---

## Step 9: API Routes

**Goal:** Wire everything together with Express routes. The API is the interface between the Cowork plugin and the service.

### Tasks:
1. Implement `src/index.ts`:
   - Express app setup with cors, helmet, express-rate-limit, JSON body parser
   - Config validation on startup (fail fast)
   - Database connection
   - Mount all route groups
   - Start cron jobs (reminders, expiry)
   - Error handling middleware
   - Graceful shutdown handler

2. Implement `src/api/middleware/auth.ts`:
   - Bearer token auth: validate `Authorization: Bearer <COSEAL_API_KEY>` header
   - Reject unauthorized requests with 401
   - Signing ceremony routes (`/sign/:token`) bypass API auth (they use token auth instead)

3. Implement `src/api/middleware/validate.ts`:
   - Generic zod validation middleware: `validate(schema: ZodSchema)` returns Express middleware
   - Validates request body, returns 400 with detailed error messages on failure

4. Implement `src/api/middleware/rateLimit.ts`:
   - API routes: 100 requests/minute per IP
   - Signing ceremony routes: 20 requests/minute per IP (prevent brute-force token guessing)

5. Implement all route handlers from ARCHITECTURE.md API Endpoints section:
   - `src/api/routes/envelopes.ts` — all envelope CRUD and actions
   - `src/api/routes/signing.ts` — signing ceremony endpoints
   - `src/api/routes/templates.ts` — template CRUD
   - `src/api/routes/webhooks.ts` — webhook management
   - `src/api/routes/health.ts` — `GET /health` returns `{ status: 'ok', version: '0.1.0' }`
   - Route handlers should be thin: validate input, call domain service, format response
   - All responses follow `{ success: boolean, data?: T, error?: string }`

6. Add **bulk send** endpoint to `src/api/routes/envelopes.ts`:
   - `POST /api/envelopes/bulk` — accepts a template ID + CSV/JSON array of signers (up to 1,000 per request)
   - Creates one envelope per signer row, each with their own unique copy of the document
   - Accepts column mapping: `{ nameColumn: 'Full Name', emailColumn: 'Email', ... }`
   - Returns `{ created: number, failed: number, envelopeIds: string[], errors: { row: number, error: string }[] }`
   - Sends all envelopes asynchronously after creation (queue-based with configurable concurrency)
   - Implement `src/workflow/bulkSender.ts`:
     - `processBulkSend(templateId: string, recipients: BulkRecipient[], options?: BulkOptions): Promise<BulkResult>`
     - Rate-limits sending to avoid overwhelming email provider (default: 10/second)
     - Logs a single bulk audit event with the batch ID, plus individual audit events per envelope
   - Add `GET /api/envelopes/bulk/:batchId/status` — returns progress of a bulk send operation
   - Add bulk actions: `POST /api/envelopes/bulk/void` (void multiple envelopes), `POST /api/envelopes/bulk/remind` (resend reminders to all unsigned)

7. Add **PowerForms** (self-service signing) endpoint:
   - `POST /api/powerforms` — create a PowerForm from a template. Returns a public URL (e.g., `/powerform/:powerformId`) that anyone can visit to fill out and sign without an invitation.
   - The PowerForm page collects signer name + email, then generates a unique envelope from the template and starts the signing ceremony immediately.
   - Useful for: waivers, consent forms, applications, onboarding docs — anything where the signer initiates the process.
   - `GET /api/powerforms` — list PowerForms with usage stats (how many envelopes generated)
   - `DELETE /api/powerforms/:id` — deactivate a PowerForm
   - Optional: rate limit PowerForm submissions per IP (prevent abuse)

8. Add **envelope correction** endpoints:
   - `PUT /api/envelopes/:id/correct` — modify a sent envelope (add/remove signers, reposition fields, swap documents). Calls `envelopeCorrector.ts`. Only allowed for envelopes in `sent` status with at least one unsigned signer.
   - Returns the updated envelope with new signing tokens for affected signers.

9. Add file upload support for document upload (multer or busboy) on the create envelope endpoint. Support **multiple documents** per envelope — each document gets its own entry in the `documents` table with visibility controls per signer.

7. Write integration tests that:
   - Create an envelope via API
   - Send it
   - Simulate a signer opening the link, filling fields, and completing
   - Verify the envelope is sealed
   - Download the sealed PDF
   - Check the audit trail

### Verification:
```bash
docker-compose up -d
npm run dev
# Run integration tests:
npm test -- src/api/
# Manual: curl http://localhost:3000/health should return { "success": true, "data": { "status": "ok" } }
```

### On completion:
Update CLAUDE.md STATUS to: **Step 9 complete — Full API operational, integration tests passing**

---

## Step 10: Signing UI

**Goal:** Build the React web app that signers see when they open their signing link.

### Tasks:
1. Scaffold the signing-ui as a separate app inside `signing-ui/`:
   - Vite + React 18 + TypeScript
   - Tailwind CSS for styling
   - Separate `package.json`
   - Build output goes to `signing-ui/dist/` which the Express app serves as static files

2. Implement `signing-ui/src/pages/VerifyPage.tsx`:
   - If identity verification is required, show email code or SMS OTP input
   - Clean, centered, mobile-responsive layout
   - Submit code → if valid, redirect to SigningPage

3. Implement `signing-ui/src/pages/SigningPage.tsx`:
   - Full-page PDF viewer using PDF.js (pdfjs-dist)
   - Field overlays positioned on top of the PDF at the coordinates from the API
   - Highlighted fields that pulse/glow to guide the signer
   - Progress indicator: "3 of 5 fields complete"
   - "Finish" button that activates when all required fields are filled

4. Implement `signing-ui/src/components/SignaturePad.tsx`:
   - Three modes: Draw (canvas with touch/mouse), Type (name rendered in script font), Upload (image file)
   - Tab interface to switch between modes
   - Preview of the signature before applying
   - "Clear" and "Apply" buttons

5. Implement `signing-ui/src/components/PDFViewer.tsx`:
   - Renders all pages of the PDF
   - Responsive — works on desktop and mobile
   - Zoom controls
   - Field overlays positioned absolutely over each page

6. Implement `signing-ui/src/components/` — field components:
   - `SignatureField.tsx` — click to open SignaturePad, shows applied signature
   - `InitialField.tsx` — smaller version of signature
   - `DateField.tsx` — auto-fills with current date, or date picker
   - `TextField.tsx` — free text input with validation display (error messages below field)
   - `CheckboxField.tsx`
   - `RadioGroupField.tsx` — radio button group rendering all options for a given `groupId`, only one selectable
   - `DropdownField.tsx` — select element populated from field `options` array
   - `NumberField.tsx` — numeric input with optional min/max, step, decimal places; prevents non-numeric input
   - `CurrencyField.tsx` — wraps NumberField with currency symbol prefix and locale-aware formatting
   - `CalculatedField.tsx` — read-only display that auto-updates when referenced fields change; subscribes to field value context
   - `AttachmentField.tsx` — file upload button (accept images + PDF), preview thumbnail, max 10MB
   - All fields support `data-validation` display: red border + error text when invalid, green check when valid

7. Implement `signing-ui/src/hooks/useFieldLogic.ts`:
   - React context + hook that manages conditional field visibility and calculated field values
   - `useFieldState()` returns current values, visibility map, and validation state for all fields
   - When a field value changes: re-evaluate all conditional rules → update visibility → re-evaluate all calculated fields → update linked fields
   - Debounced evaluation (100ms) to prevent performance issues with many interdependent fields

8. Implement `signing-ui/src/pages/CompletePage.tsx`:
   - "You've signed the document" confirmation
   - Option to download a copy
   - Clean, reassuring design

8. Implement `signing-ui/src/pages/ExpiredPage.tsx`:
   - "This signing link has expired" or "This document has been voided"
   - Contact info for the sender

10. Style everything to be professional, clean, and trustworthy:
   - White/light gray background, clear typography
   - The signing experience should feel as professional as DocuSign
   - Mobile-first responsive design

11. **Accessibility (ADA Section 508 / WCAG 2.1 AA compliance)** — this is a MUST for enterprise adoption:
   - All interactive elements must be keyboard-navigable (Tab, Enter, Escape)
   - ARIA labels on every field: `aria-label`, `aria-required`, `aria-invalid`, `aria-describedby` for error messages
   - Focus management: auto-focus first incomplete field, visible focus rings, skip-to-content link
   - Screen reader support: announce field type, required status, and validation errors. Use `role="alert"` for live validation feedback.
   - Color contrast: all text meets 4.5:1 ratio (WCAG AA). Error states don't rely on color alone — use icons + text.
   - SignaturePad alternative: for users who can't draw, the "Type" signature mode is the accessible fallback. Ensure it's reachable via keyboard.
   - Touch targets: minimum 44x44px on all interactive elements (mobile requirement)
   - Reduced motion: respect `prefers-reduced-motion` — disable field pulse/glow animations
   - Test with VoiceOver (macOS/iOS) and a screen reader plugin (NVDA or axe-core automated testing)

12. Implement `signing-ui/src/pages/InPersonPage.tsx` — In-person signing mode:
   - Activated via URL parameter `?mode=in-person` or API flag on envelope
   - Flow: Sender authenticates → hands device to signer → signer sees "You are signing as [Name]" confirmation → signs → returns device → next signer
   - Between signers: "Please return this device to [sender name]" interstitial screen
   - No email notification sent for in-person signers (they're physically present)
   - Audit trail records: "Signed in person on device [user-agent] at [IP]"

13. Implement `signing-ui/src/pages/PowerFormPage.tsx` — self-service signing:
   - Public URL `/powerform/:powerformId` — no invitation needed, anyone can access
   - Step 1: Signer enters their name + email (+ optional phone for WhatsApp/SMS)
   - Step 2: System creates a unique envelope from the PowerForm's template, generates a signing token
   - Step 3: Redirects to standard SigningPage for field completion and signing
   - Rate limited: max 10 submissions per IP per hour (configurable)
   - Optional CAPTCHA integration to prevent bot abuse

14. Update `signing-ui/src/components/PDFViewer.tsx` for multi-document envelopes:
   - Document tab bar showing all visible documents (filtered by signer visibility)
   - Active document indicator, click to switch between documents
   - Fields are scoped to the active document — progress indicator shows per-document and overall completion
   - "Next Document" button after completing all fields on current document

15. **Branding enforcement** — CoSeal branding must be visible per the project license:
   - `signing-ui/src/components/CoSealBranding.tsx` — renders the CoSeal logo + "Powered by CoSeal" in the signing UI footer, completion page, and email templates
   - The branding component reads `COSEAL_BRANDING_ENTITLEMENT` env var. If a valid entitlement key is present, branding can be customized or hidden. If absent, the default CoSeal branding is rendered and cannot be removed.
   - The branding element must NOT be hidden via CSS overrides, z-index tricks, or `display:none`. The component includes a runtime integrity check that verifies the branding DOM element is visible and unmodified (checking `offsetHeight > 0`, `visibility !== 'hidden'`, `opacity > 0`).
   - Admin dashboard header also displays "CoSeal" branding with the same entitlement logic.
   - See `LICENSE` for full branding protection terms.

16. Configure the Express app in `src/index.ts` to serve `signing-ui/dist/` at the `/sign/*` and `/powerform/*` routes, with the React app handling client-side routing

### Verification:
```bash
cd signing-ui && npm install && npm run build
cd .. && npm run dev
# Open http://localhost:3000/sign/test-token in a browser
# The signing UI should load (will show error for invalid token, but the UI renders)
```

### On completion:
Update CLAUDE.md STATUS to: **Step 10 complete — Signing UI built, served by Express, looks professional**

---

## Step 11: End-to-End Integration Test

**Goal:** Verify the complete flow works: create envelope → send → sign → seal → download.

### Tasks:
1. Create `scripts/e2e-test.ts` — an end-to-end test script that:
   - Generates a dev certificate if one doesn't exist
   - Creates a simple test PDF (using pdf-lib)
   - Calls the API to create an envelope with 2 signers, 3 fields
   - Sends the envelope
   - Simulates signer 1: open token URL, fill fields, complete signing
   - Simulates signer 2: open token URL, fill fields, complete signing
   - Verifies envelope status is `completed`
   - Downloads the sealed PDF — verifies it's valid and contains signatures
   - Downloads the Certificate of Completion — verifies it contains audit trail
   - Exports the audit trail as JSON — verifies all events are present
   - Prints: "✅ End-to-end test passed" or fails with detailed errors

2. Verify the sealed PDF opens in a standard PDF viewer (Adobe, Preview) with signatures visible

3. Verify the Certificate of Completion is a well-formatted PDF

4. Fix any issues discovered during end-to-end testing

### Verification:
```bash
docker-compose up -d
npm run dev &
npx tsx scripts/e2e-test.ts
# Must print: ✅ End-to-end test passed
```

### On completion:
Update CLAUDE.md STATUS to: **Step 11 complete — Full end-to-end flow verified**

---

## Step 12: Cowork Plugin

**Goal:** Create the Cowork plugin files that integrate CoSeal into Claude's workflow.

### Tasks:
1. Create the plugin directory structure:
   ```
   coseal-plugin/
   ├── .claude-plugin/plugin.json
   ├── .mcp.json
   ├── README.md
   ├── commands/
   │   ├── send-for-signature.md
   │   ├── check-status.md
   │   ├── send-reminder.md
   │   ├── void-envelope.md
   │   ├── download-signed.md
   │   ├── manage-templates.md
   │   ├── bulk-send.md
   │   └── analytics.md
   └── skills/
       ├── signing-workflow/SKILL.md
       ├── field-placement/SKILL.md
       ├── signer-routing/SKILL.md
       └── audit-compliance/SKILL.md
   ```

2. Implement `plugin.json` from ARCHITECTURE.md

3. Implement `.mcp.json` from ARCHITECTURE.md

4. Write each command markdown file. Each command file should contain:
   - Description of what the command does
   - What inputs Claude should collect from the user (or infer from context)
   - The API call(s) to make to the CoSeal service via MCP
   - How to format and present the response to the user
   - Error handling guidance

   For `/coseal:send`:
   - Claude should identify the document (from workspace or Legal plugin output)
   - Ask for signer names and emails (or infer from contract parties)
   - Ask for signing order preference (sequential or parallel)
   - Intelligently place signature fields based on document analysis
   - Call the create + send API endpoints
   - Confirm to user with signer list and tracking info

   For `/coseal:status`:
   - Accept envelope ID or let Claude find the most recent envelope
   - Display: status, who has signed, who is pending, timestamps
   - Suggest next action (remind, void, download)

   For `/coseal:download`:
   - Download sealed PDF and Certificate of Completion
   - Save to the user's workspace folder
   - Report the SHA-256 fingerprint for verification

   For `/coseal:bulk`:
   - Claude should identify the template to use (or help create one)
   - Accept a list of recipients: CSV file, pasted table, or Claude extracts from context (e.g., "send this NDA to all vendors in the spreadsheet")
   - Map columns to signer fields (name, email, notification channel)
   - Call the bulk send API endpoint
   - Report: "Created X envelopes, sending now. Use `/coseal:status` to track progress."

   For `/coseal:analytics`:
   - Display summary stats: total envelopes, completion rate, average time-to-sign
   - Show recent activity
   - Highlight overdue items that need attention
   - Suggest actions: "3 envelopes are pending for over 48 hours — want me to send reminders?"

5. Write each skill markdown file:
   - `signing-workflow/SKILL.md` — teaches Claude the end-to-end signing process, when to suggest signing, how signing order works, what constitutes a complete signing ceremony
   - `field-placement/SKILL.md` — teaches Claude how to intelligently place signature fields on a contract (signature on last page, initials on each page, date fields next to signatures, etc.)
   - `signer-routing/SKILL.md` — teaches Claude about sequential vs parallel signing, when each is appropriate, how to determine signing order from contract context
   - `audit-compliance/SKILL.md` — teaches Claude about ESIGN Act, UETA, eIDAS requirements, what makes a signature legally valid, how to explain compliance to users

### Verification:
- Validate `plugin.json` is valid JSON with correct structure
- Validate `.mcp.json` is valid JSON
- All command files exist and contain meaningful content
- All skill files exist and contain meaningful content
- README.md explains installation and setup

### On completion:
Update CLAUDE.md STATUS to: **Step 12 complete — Cowork plugin ready for installation**

---

## Step 13: Docker Production Build

**Goal:** Create a production-ready Docker setup that launches the full stack with one command.

### Tasks:
1. Update `Dockerfile`:
   - Multi-stage: build TypeScript + build React UI → copy both into slim production image
   - Include the generated dev cert for out-of-box experience
   - Run as non-root user
   - Health check instruction

2. Update `docker-compose.yml`:
   - `coseal-api` service with correct env vars and volume mounts
   - `postgres` with persistent volume
   - `minio` for local S3 (with a setup script to create the default bucket)
   - Network configuration so all services can communicate
   - Health checks on all services

3. Create `docker-compose.prod.yml` as an override for production:
   - No MinIO (use real S3)
   - External PostgreSQL connection
   - TLS configuration hints

4. Create a `scripts/setup.sh`:
   - Generates a self-signed cert if none exists
   - Creates `.env` from `.env.example` with sensible defaults
   - Runs `docker-compose up -d`
   - Waits for services to be healthy
   - Runs database migrations
   - Prints: "CoSeal is running at http://localhost:3000"

5. Verify: `./scripts/setup.sh` on a clean machine (or clean Docker environment) should get the full stack running with zero manual configuration

### Verification:
```bash
docker-compose down -v  # Clean slate
./scripts/setup.sh
curl http://localhost:3000/health
# Must return { "success": true, "data": { "status": "ok" } }
npx tsx scripts/e2e-test.ts
# Must pass
```

### On completion:
Update CLAUDE.md STATUS to: **Step 13 complete — One-command deployment working**

---

## Step 14: Documentation

**Goal:** Write the docs that make CoSeal usable by others.

### Tasks:
1. `docs/API.md` — Full REST API reference:
   - Every endpoint with method, path, description, request body (with examples), response body (with examples)
   - Authentication section
   - Error codes and formats
   - Rate limiting

2. `docs/DEPLOYMENT.md` — Production deployment guide:
   - Docker deployment
   - Kubernetes deployment (basic manifests, note Helm chart is roadmap)
   - Environment variable reference
   - TLS/SSL setup
   - Using real S3 vs MinIO
   - Using managed PostgreSQL
   - Backup strategy

3. `docs/COMPLIANCE.md` — Legal compliance guide:
   - ESIGN Act requirements and how CoSeal meets each
   - UETA requirements
   - eIDAS overview (SES, AES, QES) and current CoSeal support level
   - Audit trail as evidence — what it contains and why it matters
   - Disclaimer that CoSeal assists with compliance but users should consult legal counsel

4. `docs/SECURITY.md` — Security documentation:
   - Encryption at rest (AES-256-GCM)
   - Encryption in transit (TLS requirement)
   - Token security model
   - Audit trail immutability
   - Rate limiting
   - Identity verification options
   - Responsible disclosure policy placeholder

5. `CONTRIBUTING.md` — Contributor guide:
   - Development setup
   - Project structure overview
   - How to run tests
   - PR guidelines
   - Good first issues suggestions

6. `LICENSE` — CoSeal License (BSD 3-Clause + Branding Protection). See the `LICENSE` file in the project root. This is based on the Open WebUI license model: BSD 3-Clause with an additional clause protecting the CoSeal name, logo, and branding from removal or alteration in any deployment or distribution. White-labeling requires an enterprise entitlement. The license must be copied verbatim from the `LICENSE` file created in this recipe.

7. **Admin analytics dashboard** — `signing-ui/src/pages/AdminDashboard.tsx`:
   - A simple, clean dashboard accessible at `/admin` (protected by API key auth)
   - **Summary cards**: Total envelopes (by status), envelopes sent this month, average time-to-complete, completion rate (%)
   - **Charts** (use Recharts or Chart.js):
     - Envelopes over time (daily/weekly/monthly line chart)
     - Status breakdown (pie chart: completed/pending/expired/voided)
     - Average signing time trend
   - **Recent activity feed**: last 20 audit events with envelope link, signer, action, timestamp
   - **Signer analytics**: top signers by response time, signers with pending documents
   - Backend: add `GET /api/admin/analytics` endpoint that aggregates from `audit_events` and `envelopes` tables
     - Query params: `period` (7d, 30d, 90d, all), `organizationId` (for multi-tenant)
     - Returns: `{ summary: {...}, dailyCounts: [...], statusBreakdown: [...], recentEvents: [...] }`
   - This gives admins visibility without requiring external BI tools

### Verification:
- All docs exist and are properly formatted markdown
- All links within docs are valid
- API docs match actual implemented endpoints

### On completion:
Update CLAUDE.md STATUS to: **Step 14 complete — Documentation written, project ready for launch**

---

## Step 15: Launch Prep

**Goal:** Final polish before pushing to GitHub.

### Tasks:
1. Review `README.md` — update any details that changed during implementation
2. Add badges to README: license, build status placeholder, Docker pulls placeholder
3. Create `CHANGELOG.md` with a `v0.1.0` entry summarizing everything
4. Create GitHub issue templates:
   - Bug report
   - Feature request
5. Create `.github/workflows/ci.yml` — GitHub Actions CI:
   - Run on PR and push to main
   - Lint (eslint)
   - Type check (tsc --noEmit)
   - Unit tests (vitest)
   - Build Docker image
6. Tag as `v0.1.0`
7. Final `docker-compose down -v && ./scripts/setup.sh && npx tsx scripts/e2e-test.ts` — must pass clean

### Verification:
```bash
# Full clean test
docker-compose down -v
./scripts/setup.sh
npx tsx scripts/e2e-test.ts
# ✅ End-to-end test passed
```

### On completion:
Update CLAUDE.md STATUS to: **Step 15 complete — Core CoSeal v0.1.0 passing, moving to enterprise features**

---

## Step 16: eIDAS Compliance — Advanced Electronic Signatures (AES)

**Goal:** Support Advanced Electronic Signatures under EU eIDAS regulation, making CoSeal usable for European transactions.

### Context:
eIDAS defines three signature levels:
- **SES (Simple)** — what we already have (intent + consent + association)
- **AES (Advanced)** — uniquely linked to signer, capable of identifying signer, created using data under signer's sole control, linked to data so any change is detectable
- **QES (Qualified)** — AES + created by a qualified signature creation device + based on a qualified certificate issued by a trust service provider

CoSeal's existing crypto sealing already meets most AES requirements. The gaps are stronger signer identification and explicit linkage between the signer's identity and the signature.

### Tasks:
1. Extend `src/ceremony/identityVerifier.ts` with AES-level verification:
   - `verifyIdentityAES(signer: Signer, method: AESVerificationMethod): Promise<AESVerificationResult>`
   - Supported methods:
     - **Email + SMS OTP combo** — signer must verify both (two-factor)
     - **Government ID check** — integrate with Jumio or Onfido API for document verification (passport, driver's license, national ID)
     - **Bank-grade identity** — placeholder for future bank ID integrations (BankID, iDIN, etc.)
   - Store verification evidence (method used, verification timestamp, evidence reference) in a new `identity_verifications` table
   - Verification evidence is included in the audit trail and Certificate of Completion

2. Add `identity_verifications` table:
   ```sql
   CREATE TABLE identity_verifications (
       id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       signer_id       UUID NOT NULL REFERENCES signers(id),
       method          TEXT NOT NULL,  -- email_sms | government_id | bank_id
       status          TEXT NOT NULL,  -- pending | verified | failed
       evidence        JSONB NOT NULL, -- method-specific verification data
       provider        TEXT,           -- jumio | onfido | internal
       verified_at     TIMESTAMPTZ,
       created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```

3. Extend the envelope creation API to accept a `verification_level` parameter:
   - `simple` (default) — email verification only (SES)
   - `advanced` — two-factor or government ID (AES)
   - `qualified` — placeholder, returns error "QES not yet supported, coming soon"

4. Extend the signing ceremony flow:
   - If `verification_level` is `advanced`, the VerifyPage shows the appropriate verification flow before the signer can access the document
   - Government ID flow: signer uploads photo of ID → sent to Jumio/Onfido API → result stored as evidence
   - Two-factor flow: email code + SMS OTP, both must pass

5. Extend `src/crypto/sealer.ts`:
   - For AES-level signatures, include signer identity verification evidence in the PDF signature metadata
   - The signature should reference the verification method and timestamp

6. Extend `src/crypto/completionCert.ts`:
   - Certificate of Completion now includes an "Identity Verification" section for each signer
   - Shows method used, verification timestamp, and provider

7. Extend the signing UI `VerifyPage.tsx`:
   - Add government ID upload flow (camera capture or file upload)
   - Add two-factor verification flow (email code screen → SMS code screen)
   - Progress indicator showing verification steps
   - Professional, reassuring copy explaining why verification is needed

8. Add environment variables:
   ```bash
   # Identity Verification Providers (optional — only needed for AES)
   JUMIO_API_KEY=xxx
   JUMIO_API_SECRET=xxx
   # Or:
   ONFIDO_API_TOKEN=xxx
   ```

9. Graceful degradation: if no ID verification provider is configured, AES falls back to two-factor (email + SMS) which still meets AES requirements in most cases. Log a warning suggesting ID verification for stronger compliance.

### Verification:
```bash
npm test -- src/ceremony/identityVerifier
# Manual: create an envelope with verification_level=advanced
# Walk through the two-factor verification flow
# Verify the Certificate of Completion includes identity verification details
```

### On completion:
Update CLAUDE.md STATUS to: **Step 16 complete — eIDAS AES signatures supported**

---

## Step 17: Qualified Electronic Signatures (QES) — Trust Service Provider Integration

**Goal:** Support QES by integrating with external Trust Service Providers (TSPs) that issue qualified certificates.

### Context:
QES is the highest level under eIDAS — legally equivalent to a handwritten signature in the EU. It requires:
- A qualified certificate issued by a qualified TSP
- A qualified signature creation device (QSCD)
- Face-to-face or equivalent identity verification

CoSeal cannot be a TSP itself (that requires EU accreditation). Instead, CoSeal integrates with existing TSPs to request qualified certificates on behalf of signers.

### Tasks:
1. Create `src/crypto/tspIntegration.ts` — an abstraction layer for Trust Service Providers:
   - `interface TrustServiceProvider`:
     - `initiateQES(signer: SignerInfo): Promise<QESSession>` — start a QES session
     - `checkStatus(sessionId: string): Promise<QESStatus>` — poll for completion
     - `getQualifiedCertificate(sessionId: string): Promise<Buffer>` — retrieve the qualified cert
     - `signWithQSCD(sessionId: string, documentHash: string): Promise<Buffer>` — request signing via the TSP's QSCD
   - Implement adapters for at least two TSPs:
     - **Swisscom AIS** (Swiss/EU) — REST API based
     - **Namirial** (Italian, widely used in EU)
   - Each adapter in its own file: `src/crypto/tsp/swisscom.ts`, `src/crypto/tsp/namirial.ts`
   - Factory function: `getTSP(provider: string): TrustServiceProvider`

2. Extend the signing ceremony for QES:
   - When `verification_level` is `qualified`:
     a. Signer goes through ID verification (video ident or redirect to TSP's ID process)
     b. TSP issues a one-time qualified certificate for the signer
     c. Document hash is sent to TSP's QSCD for signing
     d. TSP returns the qualified digital signature
     e. CoSeal embeds the TSP's qualified signature into the PDF
   - The signer never handles cryptographic keys — the TSP's QSCD does it

3. Extend the signing UI for QES:
   - QES verification page: explains the process, redirects to TSP's identity verification if needed
   - Waiting state: "Your identity is being verified by [TSP name]..."
   - Signature confirmation: "Your qualified electronic signature has been applied"

4. Extend the Certificate of Completion:
   - For QES signatures, include: TSP name, qualified certificate serial number, QSCD reference, timestamp from TSP's qualified timestamp

5. Add environment variables:
   ```bash
   # QES Trust Service Provider (optional — only needed for QES)
   QES_PROVIDER=swisscom          # swisscom | namirial
   SWISSCOM_AIS_URL=https://ais.swisscom.com
   SWISSCOM_AIS_KEY=xxx
   SWISSCOM_AIS_CERT_PATH=/certs/swisscom-client.pem
   # Or:
   NAMIRIAL_API_URL=xxx
   NAMIRIAL_API_KEY=xxx
   ```

6. If no TSP is configured and a user requests QES, return a clear error: "QES requires a Trust Service Provider. Configure one in your environment variables. See docs/COMPLIANCE.md for setup instructions."

7. Update `docs/COMPLIANCE.md`:
   - Full section on QES setup
   - List of supported TSPs with links to their developer documentation
   - Pricing notes (TSPs charge per signature, typically €0.50–€2.00)
   - Step-by-step TSP onboarding guide

### Verification:
```bash
npm test -- src/crypto/tsp/
# Full QES testing requires a TSP sandbox account
# Document in tests which are unit tests (mockable) vs integration tests (need sandbox)
```

### On completion:
Update CLAUDE.md STATUS to: **Step 17 complete — QES via Trust Service Provider integration built**

---

## Step 18: Enterprise Authentication — SSO / SAML

**Goal:** Allow enterprise users to authenticate signers via their organization's identity provider.

### Tasks:
1. Create `src/auth/sso.ts`:
   - Support SAML 2.0 for enterprise SSO (using `@node-saml/passport-saml` or `saml2-js`)
   - Support OpenID Connect as an alternative (using `openid-client`)
   - `interface SSOProvider`:
     - `initiateLogin(returnUrl: string): Promise<string>` — returns redirect URL to IdP
     - `handleCallback(samlResponse: any): Promise<SSOUser>` — validate assertion, return user info
     - `getMetadata(): string` — SP metadata XML for IdP configuration

2. Create `src/auth/ssoConfig.ts`:
   - Multi-tenant SSO configuration stored in database:
   ```sql
   CREATE TABLE sso_configurations (
       id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       organization_id TEXT NOT NULL UNIQUE,
       provider_type   TEXT NOT NULL,  -- saml | oidc
       config          JSONB NOT NULL, -- IdP metadata URL, entity ID, certs, etc.
       enabled         BOOLEAN DEFAULT true,
       created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```

3. Extend the signing ceremony:
   - If the signer's email domain matches a configured SSO organization, redirect to SSO login before showing the document
   - After SSO auth, the signer's identity is verified via their enterprise IdP — stronger than email verification
   - SSO verification counts as AES-level identity verification

4. Add API endpoints for SSO management:
   - `POST /api/sso/configurations` — create/update SSO config for an organization
   - `GET /api/sso/configurations/:orgId` — get SSO config
   - `GET /api/sso/metadata/:orgId` — get SP metadata XML (for IdP configuration)
   - `POST /api/sso/callback` — SAML assertion consumer service
   - `GET /api/sso/login/:orgId` — initiate SSO login

5. Extend the signing UI:
   - SSO login redirect page with organization branding
   - "Sign in with your organization" button on the VerifyPage when SSO is detected
   - Fallback to email/SMS verification if SSO fails

6. Add environment variables:
   ```bash
   # SSO (optional)
   SSO_ENABLED=true
   SSO_SP_ENTITY_ID=https://sign.yourdomain.com/sso
   SSO_SP_CERT_PATH=/certs/sso-sp.pem
   SSO_SP_KEY_PATH=/certs/sso-sp-key.pem
   ```

7. Update `docs/DEPLOYMENT.md` with SSO setup guide including:
   - How to configure Okta, Azure AD, Google Workspace as IdPs
   - SP metadata exchange process
   - Testing SSO in development

### Verification:
```bash
npm test -- src/auth/
# SSO integration tests require a test IdP — use samltest.id or a local Keycloak instance
# Document setup for integration testing in CONTRIBUTING.md
```

### On completion:
Update CLAUDE.md STATUS to: **Step 18 complete — SSO/SAML enterprise authentication built**

---

## Step 19: Retention Policy Engine

**Goal:** Configurable document retention policies that auto-manage document lifecycle by type, industry, or custom rules.

### Tasks:
1. Create `src/storage/retentionPolicies.ts`:
   - Define retention policy schema:
   ```sql
   CREATE TABLE retention_policies (
       id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name            TEXT NOT NULL,
       description     TEXT,
       retention_days  INT NOT NULL,
       document_types  TEXT[],          -- contract | nda | amendment | etc.
       auto_delete     BOOLEAN DEFAULT false,  -- true = delete after retention, false = flag for review
       notify_before   INT DEFAULT 30,  -- days before expiry to notify
       created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
   - Pre-built policy presets:
     - `healthcare` — 7 years (HIPAA)
     - `financial` — 7 years (SEC/FINRA)
     - `tax` — 7 years (IRS)
     - `employment` — 5 years
     - `general` — 3 years
     - `custom` — user-defined

2. Extend `src/storage/retentionManager.ts`:
   - `assignPolicy(envelopeId: string, policyId: string): Promise<void>`
   - `getExpiringDocuments(daysAhead: number): Promise<Envelope[]>` — documents expiring within N days
   - `processRetention(): Promise<RetentionReport>` — cron job that:
     - Finds documents past retention period
     - If `auto_delete`: securely delete document and audit trail, log deletion event
     - If not `auto_delete`: send notification to document owner, flag for manual review
     - Sends expiry warning notifications for documents approaching retention end
   - `generateRetentionReport(): Promise<Buffer>` — PDF report of all documents, their policies, and expiry dates

3. Add API endpoints:
   - `GET /api/retention/policies` — list all policies (including presets)
   - `POST /api/retention/policies` — create custom policy
   - `PUT /api/retention/policies/:id` — update policy
   - `POST /api/envelopes/:id/retention` — assign a retention policy to an envelope
   - `GET /api/retention/report` — generate and download retention report
   - `GET /api/retention/expiring?days=30` — list documents expiring within N days

4. Extend envelope creation to accept optional `retention_policy` parameter

5. Add a retention cron job to the startup sequence (runs daily at 2am)

6. Extend the Cowork plugin:
   - Add `/coseal:retention` command — check retention status, assign policies, view expiring documents
   - Skill file `retention-compliance/SKILL.md` — teaches Claude about industry-specific retention requirements and helps users choose appropriate policies

7. Update `docs/COMPLIANCE.md` with retention policy guidance per industry

### Verification:
```bash
npm test -- src/storage/retentionManager src/storage/retentionPolicies
# Test: create envelope, assign 1-day retention policy, advance time, verify it's flagged
```

### On completion:
Update CLAUDE.md STATUS to: **Step 19 complete — Retention policy engine with industry presets built**

---

## Step 20: Mobile-Responsive Signing + Standalone SDK

**Goal:** Ensure the signing experience works flawlessly on mobile devices, and create an embeddable SDK for developers who want to add CoSeal signing to their own apps.

### Tasks:

### Part A: Mobile Optimization
1. Audit and refactor the signing UI for mobile:
   - Touch-optimized SignaturePad — larger hit targets, pinch-to-zoom on PDF, smooth drawing on touch screens
   - Responsive PDF viewer — single-column layout on mobile, swipe between pages
   - Bottom-sheet style field navigator on mobile (instead of side panel)
   - Full-screen signature capture modal on mobile
   - Test on iOS Safari and Android Chrome — these have specific viewport and touch event quirks

2. Add progressive enhancement:
   - Service worker for offline resilience (cache the signing UI shell)
   - "Add to Home Screen" support (PWA manifest)
   - Viewport meta tags and safe area handling for notched phones

3. Test on real devices or emulators:
   - iPhone 14/15 Safari
   - Android Chrome (Pixel, Samsung)
   - iPad Safari (landscape and portrait)

### Part B: Embeddable SDK
4. Create `sdk/` directory at project root:
   ```
   sdk/
   ├── src/
   │   ├── index.ts          # Main entry point
   │   ├── client.ts         # CoSealClient class
   │   ├── types.ts          # All TypeScript types
   │   └── errors.ts         # Custom error classes
   ├── package.json          # Published as @coseal/sdk
   ├── tsconfig.json
   └── README.md
   ```

5. Implement `CoSealClient`:
   ```typescript
   class CoSealClient {
     constructor(config: { baseUrl: string, apiKey: string })
     
     // Envelope management
     createEnvelope(input: CreateEnvelopeInput): Promise<Envelope>
     sendEnvelope(id: string): Promise<void>
     getEnvelope(id: string): Promise<Envelope>
     listEnvelopes(filters?: EnvelopeFilters): Promise<EnvelopeList>
     voidEnvelope(id: string, reason?: string): Promise<void>
     
     // Signing
     getSigningUrl(envelopeId: string, signerId: string): Promise<string>
     
     // Documents
     downloadSealed(id: string): Promise<Buffer>
     downloadCertificate(id: string): Promise<Buffer>
     
     // Templates
     createTemplate(input: CreateTemplateInput): Promise<Template>
     useTemplate(id: string, signers: SignerInput[]): Promise<Envelope>
     
     // Audit
     getAuditTrail(envelopeId: string, format?: 'json' | 'csv'): Promise<string>
     
     // Retention
     assignRetentionPolicy(envelopeId: string, policyId: string): Promise<void>
     
     // Webhooks
     registerWebhook(url: string, events: string[]): Promise<Webhook>
   }
   ```

6. Create `sdk/README.md` with quick start guide:
   ```typescript
   import { CoSealClient } from '@coseal/sdk';

   const coseal = new CoSealClient({
     baseUrl: 'https://sign.yourdomain.com',
     apiKey: 'your-api-key'
   });

   const envelope = await coseal.createEnvelope({
     document: fs.readFileSync('contract.pdf'),
     subject: 'Please sign the MSA',
     signers: [
       { email: 'alice@company.com', name: 'Alice', order: 1 },
       { email: 'bob@vendor.com', name: 'Bob', order: 2 }
     ],
     fields: [
       { type: 'signature', page: 5, x: 60, y: 80, width: 25, height: 5, signerId: 0 },
       { type: 'signature', page: 5, x: 60, y: 90, width: 25, height: 5, signerId: 1 },
       { type: 'date', page: 5, x: 88, y: 80, width: 10, height: 3, signerId: 0 },
       { type: 'date', page: 5, x: 88, y: 90, width: 10, height: 3, signerId: 1 }
     ]
   });

   await coseal.sendEnvelope(envelope.id);
   ```

7. Add an embeddable signing iframe/component:
   - `coseal.embedSigning(containerId: string, token: string)` — drops a signing UI into any div
   - Uses postMessage for cross-origin communication
   - Events: `onReady`, `onSigned`, `onDeclined`, `onError`

8. Build the SDK with tsup for dual CJS/ESM output

### Verification:
```bash
# Mobile: open signing URL on phone emulator, complete full signing flow
cd sdk && npm install && npm run build && npm test
# SDK: write a test script that uses the SDK to create and send an envelope
```

### On completion:
Update CLAUDE.md STATUS to: **Step 20 complete — Mobile signing polished, SDK built**

---

## Step 21: Ecosystem Integrations

**Goal:** Build integrations with the tools enterprise teams actually use, matching the Legal plugin's connector ecosystem.

### Tasks:
1. Create `src/integrations/` directory with a standard integration interface:
   ```typescript
   interface CoSealIntegration {
     name: string;
     initialize(config: Record<string, string>): Promise<void>;
     onEnvelopeCompleted?(envelope: Envelope): Promise<void>;
     onEnvelopeSent?(envelope: Envelope): Promise<void>;
     onSignerCompleted?(signer: Signer, envelope: Envelope): Promise<void>;
   }
   ```

2. **Slack integration** (`src/integrations/slack.ts`):
   - Post notifications to a Slack channel when envelopes are sent, signed, completed
   - Interactive message with "View Status" button
   - Uses Slack Incoming Webhooks (simple) or Slack Bot (richer)
   - Config: `SLACK_WEBHOOK_URL` or `SLACK_BOT_TOKEN` + `SLACK_CHANNEL`

3. **Box integration** (`src/integrations/box.ts`):
   - Auto-upload completed sealed documents to a Box folder
   - Organize by date or matter/deal name
   - Config: `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, `BOX_FOLDER_ID`

4. **Egnyte integration** (`src/integrations/egnyte.ts`):
   - Same as Box but for Egnyte — auto-upload completed docs
   - Config: `EGNYTE_DOMAIN`, `EGNYTE_ACCESS_TOKEN`, `EGNYTE_FOLDER_PATH`

5. **Microsoft 365 / SharePoint integration** (`src/integrations/microsoft365.ts`):
   - Auto-upload completed documents to SharePoint document library or OneDrive folder
   - Uses Microsoft Graph API
   - Config: `MS365_TENANT_ID`, `MS365_CLIENT_ID`, `MS365_CLIENT_SECRET`, `MS365_DRIVE_ID`

6. **Jira integration** (`src/integrations/jira.ts`):
   - Create or update Jira tickets when envelopes reach milestones
   - Attach completed documents to relevant tickets
   - Config: `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`

7. **Google Drive integration** (`src/integrations/google.ts`):
   - Auto-upload completed documents to a Google Drive folder
   - Config: `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, `GOOGLE_DRIVE_FOLDER_ID`

8. Integration management:
   - `POST /api/integrations` — enable an integration with config
   - `GET /api/integrations` — list enabled integrations
   - `DELETE /api/integrations/:name` — disable an integration
   - `POST /api/integrations/:name/test` — test connection

9. Integrations fire on envelope lifecycle events via the existing webhook dispatcher — each integration registers itself as an internal webhook handler

10. Extend the Cowork plugin:
    - Update skill files to teach Claude about available integrations
    - Claude can suggest: "I see you use Slack — want me to set up notifications for completed signatures?"

### Verification:
```bash
npm test -- src/integrations/
# Each integration should have unit tests with mocked external APIs
# Integration tests require credentials — document setup in CONTRIBUTING.md
```

### On completion:
Update CLAUDE.md STATUS to: **Step 21 complete — Slack, Box, Egnyte, M365, Jira, Google Drive integrations built**

---

## Step 22: Hosted Instance Infrastructure

**Goal:** Create the infrastructure-as-code and multi-tenant layer needed to offer a hosted CoSeal instance (the monetization layer).

### Tasks:
1. Create `deploy/` directory:
   ```
   deploy/
   ├── helm/
   │   └── coseal/
   │       ├── Chart.yaml
   │       ├── values.yaml
   │       ├── templates/
   │       │   ├── deployment.yaml
   │       │   ├── service.yaml
   │       │   ├── ingress.yaml
   │       │   ├── configmap.yaml
   │       │   ├── secret.yaml
   │       │   ├── hpa.yaml
   │       │   ├── pdb.yaml
   │       │   └── cronjob.yaml
   │       └── README.md
   ├── terraform/
   │   ├── aws/
   │   │   ├── main.tf        # VPC, ECS/EKS, RDS, S3, KMS
   │   │   ├── variables.tf
   │   │   └── outputs.tf
   │   └── gcp/
   │       ├── main.tf        # GKE, Cloud SQL, GCS, KMS
   │       ├── variables.tf
   │       └── outputs.tf
   └── k8s/
       ├── namespace.yaml
       ├── deployment.yaml
       ├── service.yaml
       ├── ingress.yaml
       └── README.md
   ```

2. Add multi-tenancy to the data model:
   ```sql
   CREATE TABLE organizations (
       id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name            TEXT NOT NULL,
       slug            TEXT UNIQUE NOT NULL,
       plan            TEXT NOT NULL DEFAULT 'free',
           -- free | pro | enterprise
       envelope_limit  INT,             -- monthly limit (null = unlimited)
       envelopes_used  INT DEFAULT 0,   -- current month count
       billing_email   TEXT,
       settings        JSONB DEFAULT '{}',
       created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   );

   CREATE TABLE api_keys (
       id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       organization_id UUID NOT NULL REFERENCES organizations(id),
       key_hash        TEXT NOT NULL,    -- hashed API key
       name            TEXT,
       permissions     TEXT[] DEFAULT ARRAY['all'],
       last_used_at    TIMESTAMPTZ,
       expires_at      TIMESTAMPTZ,
       created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```

3. Add `organization_id` foreign key to `envelopes`, `templates`, `sso_configurations`, `retention_policies`, and `webhooks` tables. Create a migration.

4. Extend auth middleware:
   - API key lookup resolves to an organization
   - All queries automatically scoped to the organization (row-level filtering)
   - Rate limits per organization based on plan tier

5. Create plan tier enforcement:
   - `free`: 5 envelopes/month, email verification only, no integrations, community support
   - `pro`: 100 envelopes/month, AES verification, all integrations, email support
   - `enterprise`: unlimited, QES, SSO, custom retention, priority support
   - Middleware that checks envelope limits before creating new envelopes

6. Create Helm chart with:
   - Configurable replicas, resource limits, HPA
   - External secrets support (for cloud secret managers)
   - Ingress with TLS
   - CronJob for retention and reminder processing
   - PodDisruptionBudget for availability

7. Create Terraform modules for AWS and GCP:
   - Managed database (RDS / Cloud SQL)
   - Object storage (S3 / GCS) with encryption
   - KMS for key management
   - Container orchestration (ECS or EKS / GKE)
   - CDN for signing UI static assets
   - Monitoring (CloudWatch / Cloud Monitoring)

8. Add a `/api/organizations/usage` endpoint that returns current month envelope count and limit

### Verification:
```bash
# Helm: helm template coseal deploy/helm/coseal/ — must render valid K8s YAML
# Terraform: cd deploy/terraform/aws && terraform validate
# Multi-tenant: create two orgs, verify they can't see each other's envelopes
npm test -- src/api/ --filter=multi-tenant
```

### On completion:
Update CLAUDE.md STATUS to: **Step 22 complete — Multi-tenant, Helm, Terraform, plan tiers built**

---

## Step 23: Final Integration + Full E2E Test

**Goal:** Run the complete system end-to-end with all enterprise and ecosystem features, ensure everything works together.

### Tasks:
1. Update `scripts/e2e-test.ts` to be a comprehensive test suite that covers:
   - **Basic flow**: create → send → sign (2 signers, sequential) → seal → download
   - **Parallel signing**: 3 signers sign in any order
   - **AES verification**: envelope with `verification_level=advanced`, two-factor flow
   - **Template flow**: create template → instantiate → send → sign
   - **Bulk send**: create template → bulk send to 10 recipients → verify all 10 envelopes created and sent
   - **Conditional fields**: create envelope with conditional field (show field B only when field A = "Yes") → sign with A="Yes" → verify B is required → sign with A="No" → verify B is hidden
   - **Calculated fields**: create envelope with calculated field (total = quantity × price) → fill quantity and price → verify calculated value
   - **Radio/dropdown fields**: create envelope with radio group and dropdown → verify only valid options accepted
   - **Field validation**: submit invalid phone/ZIP/email → verify server rejects with detailed error
   - **In-person signing**: create in-person envelope → verify no email sent → simulate device handoff flow
   - **PowerForms**: create PowerForm from template → simulate public access → verify envelope created and signed
   - **Multi-document**: create envelope with 3 PDFs, signer 1 sees docs 1+2, signer 2 sees docs 2+3 → verify visibility filtering works
   - **Conditional routing**: create envelope where field A value triggers skip of signer 2 → verify signer 3 gets notified directly
   - **Mixed routing**: create envelope with signing groups (1+2 parallel, then 3 sequential) → verify correct ordering
   - **Envelope correction**: send envelope → correct signer email → verify old token invalidated, new token sent to corrected email
   - **Anchor tags**: upload PDF containing `/sig/` and `/date/` markers → verify fields auto-placed at correct positions
   - **WhatsApp notification**: create envelope with signer notification_channel=whatsapp → verify WhatsApp API called (mock Twilio)
   - **Retention**: assign policy → verify retention date set
   - **Webhook**: register webhook → complete envelope → verify webhook fired
   - **Audit export**: JSON, CSV, PDF audit trail exports
   - **SDK**: use the SDK client to create and manage an envelope
   - **Multi-tenant**: two organizations, verify isolation
   - **Analytics**: call admin analytics endpoint → verify summary counts match actual envelope data
   - **Reminders**: create overdue envelope, trigger reminder check
   - **Void**: create and void an envelope, verify notifications
   - **Expiry**: create expired envelope, trigger expiry check
   - **Accessibility**: run axe-core automated accessibility audit on signing UI pages → zero critical violations
   - Each test prints pass/fail with details

2. Update `README.md`:
   - Remove the phased roadmap — everything ships in v1.0
   - Update the comparison table to include AES/QES, SSO, retention policies, integrations, SDK
   - Update feature list to reflect full capabilities
   - Add "Hosted Instance" section with plan tiers

3. Update `docs/API.md` with all new endpoints (retention, integrations, SSO, organizations)

4. Update `docs/DEPLOYMENT.md` with Helm and Terraform deployment instructions

5. Update `docs/COMPLIANCE.md` with full eIDAS (SES, AES, QES) documentation

6. Update `CHANGELOG.md` — version this as `v1.0.0` since it's feature-complete

7. Update CI workflow to include:
   - SDK build and test
   - Helm chart linting (`helm lint`)
   - Terraform validation
   - E2E test in CI (using docker-compose)

8. Final clean build and test:
   ```bash
   docker-compose down -v
   ./scripts/setup.sh
   npx tsx scripts/e2e-test.ts
   cd sdk && npm test
   helm lint deploy/helm/coseal/
   ```

### Verification:
```bash
# Everything must pass
docker-compose down -v && ./scripts/setup.sh && npx tsx scripts/e2e-test.ts
# ✅ All tests passed — CoSeal v1.0.0 is ready
```

### On completion:
Update CLAUDE.md STATUS to: **🚀 Step 23 complete — CoSeal v1.0.0 feature-complete, all tests passing, ready to ship**

---

## Post-Launch

After pushing to GitHub:
1. Post to Hacker News with demo video showing the full flow: review → redline → sign → sealed
2. Post to Twitter/X — position as "the open-source DocuSign replacement built for the Cowork era"
3. Post in Claude/Anthropic community channels
4. Submit the plugin to Anthropic's plugin marketplace
5. Publish `@coseal/sdk` to npm
6. Push Docker images to GitHub Container Registry
7. Publish Helm chart to a chart repository
8. Set up the hosted instance on coseal.io (or your domain)
9. Write a blog post: "How we built an open-source DocuSign alternative in [X] weeks"
