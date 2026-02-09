# CoSeal BUILD_RECIPE_EXTENSION.md

## Purpose

This document extends BUILD_RECIPE.md with features identified during final DocuSign parity audit. These steps should be executed **after the original 23 steps are complete** (or interleaved where noted). They close the remaining gaps between CoSeal and DocuSign's feature matrix.

**Context:** The original BUILD_RECIPE.md covers 91% of DocuSign's core e-signature features. This extension closes the remaining gaps to reach near-complete parity. Each step references which original BUILD_RECIPE step it extends.

---

## Step 24 — Delegated Signing & Custody Transfer

**Extends:** Step 7 (Workflow Engine) + Step 9 (API Routes) + Step 10 (Signing UI)
**Goal:** Allow signers to delegate their signing responsibility to someone else, and allow senders to transfer envelope ownership.
**Model:** Sonnet

### 24.1 Delegated Signing

A signer who receives a signing request can delegate it to another person. The original signer's token is voided and a new signer record is created with a fresh token. The audit trail records who delegated to whom.

1. Add `delegated_from` UUID column (nullable, FK to signers) to the `signers` table:
   ```sql
   ALTER TABLE signers ADD COLUMN delegated_from UUID REFERENCES signers(id);
   ```

2. Add endpoint `POST /sign/:token/delegate` to `src/api/routes/signing.ts`:
   - Request body: `{ delegateEmail: string, delegateName: string }`
   - Validate: signer status must be `pending` or `notified` (cannot delegate after opening)
   - Create new signer record with:
     - Same `envelope_id`, `role`, `signing_order`, `signing_group`
     - New email, name, token, token_expires
     - `delegated_from` set to original signer ID
   - Update all `fields` assigned to original signer → reassign to new signer
   - Void original signer's token (set status to `delegated`, add new status to enum)
   - Log audit event: `delegated` with metadata `{ from: originalEmail, to: delegateEmail }`
   - Send signing notification to the delegate
   - Return: `{ success: true, data: { delegateId, delegateEmail } }`

3. Add delegation UI to the signing page (`signing-ui/src/pages/SigningPage.tsx`):
   - "Delegate to someone else" link in the signing toolbar (before the signer has filled any fields)
   - Modal: enter delegate's name and email, confirm
   - On confirm: call `POST /sign/:token/delegate`, then show confirmation message ("You've delegated signing to [name]. They'll receive a signing link via email.")
   - If delegation is successful, the current signing session ends

4. Update the Certificate of Completion (`src/crypto/completionCert.ts`) to include delegation chain — if a signer was delegated, show: "Originally assigned to: [original]. Delegated to: [delegate] on [date]."

5. Write tests:
   - Delegate signing → verify original token voided, new token created, fields reassigned
   - Attempt to delegate after opening → verify rejection
   - Delegation chain appears in Certificate of Completion

### 24.2 Custody Transfer

Transfer ownership of an envelope from one sender to another.

1. Add endpoint `PUT /api/envelopes/:id/transfer` to `src/api/routes/envelopes.ts`:
   - Request body: `{ newOwnerId: string }` (user identifier)
   - Validate: only the current `created_by` can transfer
   - Validate: envelope must be in `draft`, `sent`, or `in_progress` status
   - Update `created_by` to new owner
   - Log audit event: `transferred` with metadata `{ from: oldOwner, to: newOwner }`
   - Return: `{ success: true, data: { envelopeId, newOwner } }`

2. Write tests:
   - Transfer ownership → verify `created_by` updated, audit event logged
   - Non-owner attempts transfer → verify rejection
   - Transfer completed envelope → verify rejection

---

## Step 25 — Locked Templates & Shared Folders

**Extends:** Step 9 (API Routes — templates) + Step 10 (Signing UI — admin)
**Goal:** Admin-controlled templates that users can instantiate but not modify. Folder organization for envelopes.
**Model:** Sonnet

### 25.1 Locked Templates

1. Add columns to `templates` table:
   ```sql
   ALTER TABLE templates ADD COLUMN is_locked BOOLEAN DEFAULT false;
   ALTER TABLE templates ADD COLUMN locked_by TEXT; -- user who locked it
   ALTER TABLE templates ADD COLUMN locked_at TIMESTAMPTZ;
   ```

2. Update `src/api/routes/templates.ts`:
   - `PUT /api/templates/:id/lock` — lock a template (only creator or admin role can lock)
   - `PUT /api/templates/:id/unlock` — unlock a template (only the user who locked it or admin)
   - `PUT /api/templates/:id` (update) — reject with 403 if template is locked: `"Template is locked by [user]. Unlock it first or create a copy."`
   - `DELETE /api/templates/:id` — reject with 403 if template is locked
   - `POST /api/templates/:id/duplicate` — create an unlocked copy of any template (locked or not). New template has `name: "[Original Name] (Copy)"`, `created_by: currentUser`, `is_locked: false`

3. Update admin dashboard to show lock icon on locked templates and provide lock/unlock/duplicate actions.

### 25.2 Shared Folders

1. Create `folders` table:
   ```sql
   CREATE TABLE folders (
       id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name        TEXT NOT NULL,
       parent_id   UUID REFERENCES folders(id), -- for nesting
       created_by  TEXT NOT NULL,
       shared_with TEXT[] DEFAULT ARRAY[]::TEXT[], -- user IDs with access
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   
   -- Junction table for envelope-folder relationship (envelope can be in multiple folders)
   CREATE TABLE envelope_folders (
       envelope_id UUID NOT NULL REFERENCES envelopes(id),
       folder_id   UUID NOT NULL REFERENCES folders(id),
       added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (envelope_id, folder_id)
   );
   
   CREATE INDEX idx_folders_created_by ON folders(created_by);
   CREATE INDEX idx_envelope_folders_envelope ON envelope_folders(envelope_id);
   CREATE INDEX idx_envelope_folders_folder ON envelope_folders(folder_id);
   ```

2. Add folder CRUD endpoints to `src/api/routes/envelopes.ts`:
   - `POST /api/folders` — create folder (name, optional parent_id, optional shared_with)
   - `GET /api/folders` — list folders for current user (owned + shared_with includes user)
   - `PUT /api/folders/:id` — update folder name, sharing
   - `DELETE /api/folders/:id` — delete folder (does not delete envelopes, just removes association)
   - `POST /api/folders/:id/envelopes` — add envelope(s) to folder: `{ envelopeIds: string[] }`
   - `DELETE /api/folders/:id/envelopes/:envelopeId` — remove envelope from folder
   - `GET /api/folders/:id/envelopes` — list envelopes in a folder (with pagination, filtering)

3. Update admin dashboard to show folder sidebar with drag-and-drop for organizing envelopes.

4. Write tests:
   - Create folder → add envelopes → list folder contents
   - Shared folders visible to shared users
   - Nested folders: create child → verify parent relationship
   - Delete folder → verify envelopes still exist

---

## Step 26 — Delayed Routing

**Extends:** Step 7 (Workflow Engine — signingOrder.ts)
**Goal:** Support timer-based delays between signing steps (e.g., 3-day cooling-off period, regulatory waiting period before next signer).
**Model:** Sonnet

1. Add `delay_hours` support to routing rules in `envelopes.routing_rules` JSONB. A routing rule can now include:
   ```json
   {
     "condition": "after_signer_completes",
     "signerOrder": 1,
     "action": "delay",
     "delay_hours": 72,
     "then": "advance_to_next"
   }
   ```

2. Add `delayed_until` TIMESTAMPTZ column to the `signers` table:
   ```sql
   ALTER TABLE signers ADD COLUMN delayed_until TIMESTAMPTZ;
   ```

3. Update `src/workflow/signingOrder.ts` → `advanceToNextSigner()`:
   - After a signer completes, check if routing rules include a delay for the next step
   - If delay exists: set `delayed_until` on the next signer(s) to `now() + delay_hours`
   - Set signer status to `delayed` (add to status enum)
   - Log audit event: `delayed` with metadata `{ until: delayedUntil, reason: "routing_rule" }`
   - Do NOT send notification yet

4. Update `src/workflow/reminderScheduler.ts` (or create `src/workflow/delayProcessor.ts`):
   - Add a check in the hourly cron: find signers where `status = 'delayed'` and `delayed_until <= now()`
   - For each: update status to `notified`, clear `delayed_until`, send signing notification
   - Log audit event: `delay_completed`

5. Update the signing ceremony status display — if an envelope has delayed signers, the status endpoint should show: "Waiting for cooling-off period. [Signer name] will be notified on [date]."

6. Write tests:
   - Create envelope with delay routing rule → complete first signer → verify next signer is `delayed`
   - Simulate time passing → run delay processor → verify notification sent
   - Status endpoint shows delay info

---

## Step 27 — RBAC (Role-Based Access Control)

**Extends:** Step 9 (API Routes — middleware) + Step 18 (SSO)
**Goal:** Granular permissions for multi-user deployments: admin, sender, viewer roles with middleware enforcement.
**Model:** Opus

### 27.1 Data Model

1. Create `users` and `roles` tables:
   ```sql
   CREATE TABLE users (
       id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       email       TEXT UNIQUE NOT NULL,
       name        TEXT,
       role        TEXT NOT NULL DEFAULT 'sender',
           -- admin | sender | viewer
       is_active   BOOLEAN DEFAULT true,
       sso_subject TEXT UNIQUE,          -- SAML/OIDC subject ID (for SSO users)
       api_key     TEXT UNIQUE,          -- per-user API key (optional, for API access)
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   
   CREATE INDEX idx_users_email ON users(email);
   CREATE INDEX idx_users_api_key ON users(api_key);
   CREATE INDEX idx_users_sso_subject ON users(sso_subject);
   ```

2. Update `envelopes.created_by` to reference `users.id` (add FK or keep as TEXT and resolve via lookup).

### 27.2 Permission Matrix

| Action | Admin | Sender | Viewer |
|--------|-------|--------|--------|
| Create envelopes | ✅ | ✅ | ❌ |
| Send envelopes | ✅ | ✅ (own only) | ❌ |
| View all envelopes | ✅ | ❌ (own only) | ✅ (all) |
| Void envelopes | ✅ | ✅ (own only) | ❌ |
| Correct envelopes | ✅ | ✅ (own only) | ❌ |
| Transfer envelopes | ✅ | ✅ (own only) | ❌ |
| Manage templates | ✅ | ✅ (own unlocked) | ❌ |
| Lock/unlock templates | ✅ | ❌ | ❌ |
| Manage PowerForms | ✅ | ✅ (own only) | ❌ |
| Bulk send | ✅ | ✅ | ❌ |
| View analytics | ✅ | ✅ (own metrics) | ✅ (all metrics) |
| Manage users | ✅ | ❌ | ❌ |
| Manage folders | ✅ | ✅ (own + shared) | ✅ (shared read-only) |
| Configure SSO | ✅ | ❌ | ❌ |
| Manage webhooks | ✅ | ❌ | ❌ |
| Manage retention policies | ✅ | ❌ | ❌ |
| View audit trail | ✅ | ✅ (own envelopes) | ✅ (all) |

### 27.3 Implementation

1. Create `src/api/middleware/rbac.ts`:
   ```typescript
   // Middleware factory: requireRole('admin', 'sender')
   export function requireRole(...roles: UserRole[]) {
     return (req: Request, res: Response, next: NextFunction) => {
       const user = req.user; // set by auth middleware
       if (!user || !roles.includes(user.role)) {
         return res.status(403).json({ success: false, error: 'Insufficient permissions' });
       }
       next();
     };
   }
   
   // Middleware: requireOwnership — checks that the envelope belongs to the requesting user
   // Admins bypass this check
   export function requireOwnership(paramName = 'id') { ... }
   ```

2. Update `src/api/middleware/auth.ts`:
   - After validating API key or JWT, look up the `users` record
   - Attach `req.user = { id, email, name, role }` to the request
   - If no user record exists (first API key use), auto-create with `sender` role

3. Apply middleware to all route files:
   - `envelopes.ts`: `requireRole('admin', 'sender')` on create/send/void/correct; `requireOwnership` on mutations
   - `templates.ts`: `requireRole('admin', 'sender')` on CRUD; `requireRole('admin')` on lock/unlock
   - `admin.ts`: `requireRole('admin', 'viewer')` on analytics; `requireRole('admin')` on user management
   - Add user management endpoints:
     - `GET /api/admin/users` — list all users (admin only)
     - `POST /api/admin/users` — create user (admin only)
     - `PUT /api/admin/users/:id` — update user role, active status (admin only)
     - `DELETE /api/admin/users/:id` — deactivate user (admin only, soft delete)

4. Update SSO integration (Step 18) to auto-provision users:
   - On first SAML/OIDC login, create a `users` record with role `sender` (configurable default)
   - SSO attributes can map to roles (e.g., SAML group "CoSeal Admins" → admin role)
   - Add `SSO_DEFAULT_ROLE` and `SSO_ADMIN_GROUPS` env vars

5. Seed the first admin user:
   - On first startup (no users in table), create an admin user from `COSEAL_ADMIN_EMAIL` env var
   - Generate and log the admin API key to stdout (one-time display)

6. Update admin dashboard UI:
   - "Users" tab: list users, change roles, activate/deactivate
   - Role badge next to user name in header
   - Senders see only their own envelopes in the dashboard; viewers see all; admins see all + management

7. Write tests:
   - Sender creates envelope → viewer cannot void it → admin can void it
   - Sender cannot see other sender's envelopes → admin sees all
   - Viewer can see all envelopes but cannot create
   - SSO auto-provision creates user with correct role
   - First startup creates admin user

---

## Step 28 — Collaborative Commenting

**Extends:** Step 10 (Signing UI)
**Goal:** Allow signers to leave comments on specific fields or document sections during the signing process, enabling negotiation without leaving the signing ceremony.
**Model:** Opus

1. Create `comments` table:
   ```sql
   CREATE TABLE comments (
       id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       envelope_id UUID NOT NULL REFERENCES envelopes(id),
       signer_id   UUID NOT NULL REFERENCES signers(id),
       document_id UUID REFERENCES documents(id),    -- which document
       field_id    UUID REFERENCES fields(id),        -- which field (optional — can be general)
       page        INT,                               -- page number (for page-level comments)
       x           FLOAT,                             -- optional position (for pin-drop comments)
       y           FLOAT,
       content     TEXT NOT NULL,
       parent_id   UUID REFERENCES comments(id),      -- for threaded replies
       resolved    BOOLEAN DEFAULT false,
       resolved_by UUID REFERENCES signers(id),
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   
   CREATE INDEX idx_comments_envelope ON comments(envelope_id);
   CREATE INDEX idx_comments_field ON comments(field_id);
   CREATE INDEX idx_comments_parent ON comments(parent_id);
   ```

2. Add comment API endpoints to `src/api/routes/signing.ts`:
   - `POST /sign/:token/comments` — create a comment (field_id optional, page + x/y optional)
   - `GET /sign/:token/comments` — list all comments on this envelope visible to this signer
   - `PUT /sign/:token/comments/:commentId/resolve` — mark comment as resolved
   - `POST /sign/:token/comments/:commentId/reply` — reply to a comment (creates child with parent_id)

3. Add comment notification:
   - When a signer leaves a comment, notify all other signers who have already been notified (email)
   - Include comment text (truncated to 200 chars) in the notification
   - Subject: "New comment on [document title]"

4. Build the commenting UI in `signing-ui/`:
   - `src/components/CommentPanel.tsx`:
     - Sidebar panel that slides in from the right
     - Shows all comments for the current document, threaded by parent
     - Each comment shows: signer avatar/initials, name, timestamp, content
     - Reply button on each comment
     - "Resolve" button (available to the envelope sender and the comment author)
     - New comment input at the bottom
   - `src/components/CommentPin.tsx`:
     - Small dot/icon overlay on the PDF at the comment's x/y position
     - Click to highlight the related comment in the CommentPanel
     - Hover shows preview of comment text
   - `src/components/CommentBadge.tsx`:
     - Shows on fields that have comments — small badge with comment count
     - Click opens the CommentPanel filtered to that field's comments
   - Integrate into `SigningPage.tsx`:
     - "Comments" button in toolbar with unread count badge
     - Click opens CommentPanel
     - Long-press (or right-click) on PDF → "Add comment here" option (captures page + x/y)
     - Comments on fields show badge next to the field

5. Add audit event: `commented` with metadata `{ commentId, fieldId, content (truncated) }`

6. Update the Certificate of Completion to include a "Comments" section if any comments exist — list each comment with author, timestamp, content, and whether it was resolved.

7. Write tests:
   - Signer adds comment on field → other signer sees it
   - Threaded reply → verify parent_id relationship
   - Resolve comment → verify resolved flag
   - Comments appear in Certificate of Completion
   - Comment notification sent to other signers

---

## Step 29 — Document Generation / Mail Merge

**Extends:** Step 5 (Document Processing) + Step 9 (API Routes)
**Goal:** Populate template fields with data from CSV/JSON before sending, enabling agreement generation without manual data entry.
**Model:** Sonnet

1. Implement `src/documents/mailMerge.ts`:
   - `mergeFields(templatePdf: Buffer, data: Record<string, string>): Promise<Buffer>`
     - Takes a PDF template with text placeholders (e.g., `{{client_name}}`, `{{contract_date}}`, `{{amount}}`)
     - Scans PDF text layer for `{{placeholder}}` patterns
     - Replaces each placeholder with the corresponding value from the data object
     - Uses pdf-lib to modify the PDF text content
     - Returns the modified PDF
   - `mergeFieldsDocx(templateDocx: Buffer, data: Record<string, string>): Promise<Buffer>`
     - Same concept but for .docx templates
     - Unzip → find/replace in document.xml → re-zip
     - Convert to PDF after merge (using libreoffice headless)
   - `validateMergeData(template: Template, data: Record<string, string>): MergeValidation`
     - Cross-reference template placeholders against provided data
     - Return: `{ valid: boolean, missingFields: string[], extraFields: string[] }`

2. Add merge endpoint to `src/api/routes/envelopes.ts`:
   - `POST /api/envelopes/generate` — create envelope with merged data:
     ```json
     {
       "templateId": "uuid",
       "mergeData": { "client_name": "Acme Corp", "amount": "$50,000" },
       "signers": [{ "email": "...", "name": "..." }]
     }
     ```
   - Validate merge data → merge fields → create envelope with populated document → return envelope

3. Extend bulk send (`POST /api/envelopes/bulk`) to accept per-recipient merge data:
   ```json
   {
     "templateId": "uuid",
     "recipients": [
       { "email": "alice@acme.com", "name": "Alice", "mergeData": { "client_name": "Acme" } },
       { "email": "bob@globex.com", "name": "Bob", "mergeData": { "client_name": "Globex" } }
     ]
   }
   ```
   Each recipient gets a uniquely generated document with their data merged in.

4. Support CSV upload for bulk merge:
   - `POST /api/envelopes/bulk/csv` — accepts multipart form with:
     - `template`: template ID
     - `csv`: CSV file where headers map to merge fields (first column = signer email, second = signer name, rest = merge data)
   - Parse CSV (using papaparse), validate against template placeholders, create bulk send

5. Write tests:
   - Simple merge: template with `{{name}}` → merge with `{ name: "Alice" }` → verify PDF contains "Alice"
   - Missing field: merge without required field → verify validation error
   - Bulk merge: 3 recipients with different data → verify 3 unique PDFs generated
   - CSV upload: parse CSV → verify correct number of envelopes created

---

## Step 30 — Team Reports & Enhanced Analytics

**Extends:** Step 10 (Admin Dashboard)
**Goal:** Per-user and per-team analytics that match DocuSign's reporting capabilities.
**Model:** Sonnet

1. Extend `GET /api/admin/analytics` with query parameters:
   - `?userId=uuid` — filter metrics to a specific user
   - `?dateFrom=ISO&dateTo=ISO` — date range filter
   - `?groupBy=user|day|week|month` — aggregation grouping

2. Add new analytics endpoints:
   - `GET /api/admin/analytics/users` — per-user breakdown:
     ```json
     [
       { "userId": "...", "name": "Alice", "sent": 45, "completed": 38, "avgTurnaround": "2.3h" },
       { "userId": "...", "name": "Bob", "sent": 23, "completed": 20, "avgTurnaround": "5.1h" }
     ]
     ```
   - `GET /api/admin/analytics/templates` — per-template usage stats:
     ```json
     [
       { "templateId": "...", "name": "NDA", "timesUsed": 120, "completionRate": "94%", "avgTurnaround": "1.8h" },
       { "templateId": "...", "name": "SOW", "timesUsed": 45, "completionRate": "87%", "avgTurnaround": "8.2h" }
     ]
     ```
   - `GET /api/admin/analytics/export` — export analytics as CSV or PDF report

3. Update admin dashboard UI:
   - Add "Users" tab to analytics with per-user metrics table and charts
   - Add "Templates" tab showing template usage ranking
   - Add date range picker that filters all dashboard widgets
   - Add CSV export button on each analytics view
   - Sender role sees only their own metrics; admin/viewer sees all

4. Write tests:
   - Per-user analytics returns correct counts
   - Date range filtering works
   - CSV export contains expected columns and data

---

## Step 31 — CoSeal for Salesforce (Managed Package)

**Extends:** Step 21 (Integrations — Salesforce)
**Goal:** An installable Salesforce package that lets users send documents for signature directly from Salesforce records — matching DocuSign's AppExchange integration.
**Model:** Opus

### Overview

DocuSign's Salesforce integration provides:
- A button on Opportunity/Account/Contact records to "Send for Signature"
- Auto-population of signer fields from Salesforce contact data
- Embedded signing within Salesforce (iframe)
- Auto-sync: when signed, the completed PDF is attached to the Salesforce record and status fields update
- Apex Toolkit for custom programmatic control

CoSeal can replicate this because we already have:
- REST API for envelope creation (Step 9)
- Embeddable signing via iframe + postMessage (Step 20 SDK)
- Webhooks for completion callbacks (Step 9)
- Salesforce integration basics in Step 21

### 31.1 Salesforce Package Structure

Create a `salesforce/` directory in the CoSeal repo:

```
salesforce/
├── force-app/
│   └── main/
│       └── default/
│           ├── classes/
│           │   ├── CoSealService.cls            # Core service — HTTP callouts to CoSeal API
│           │   ├── CoSealService.cls-meta.xml
│           │   ├── CoSealEnvelopeController.cls  # Controller for LWC components
│           │   ├── CoSealEnvelopeController.cls-meta.xml
│           │   ├── CoSealWebhookHandler.cls      # Inbound webhook from CoSeal
│           │   ├── CoSealWebhookHandler.cls-meta.xml
│           │   ├── CoSealConfig.cls              # Custom settings accessor
│           │   ├── CoSealConfig.cls-meta.xml
│           │   ├── CoSealServiceTest.cls         # Test coverage
│           │   └── CoSealServiceTest.cls-meta.xml
│           ├── lwc/
│           │   ├── cosealSendButton/             # "Send for Signature" button component
│           │   │   ├── cosealSendButton.html
│           │   │   ├── cosealSendButton.js
│           │   │   └── cosealSendButton.js-meta.xml
│           │   ├── cosealSigningEmbed/           # Embedded signing iframe
│           │   │   ├── cosealSigningEmbed.html
│           │   │   ├── cosealSigningEmbed.js
│           │   │   └── cosealSigningEmbed.js-meta.xml
│           │   ├── cosealEnvelopeStatus/         # Status tracker on record page
│           │   │   ├── cosealEnvelopeStatus.html
│           │   │   ├── cosealEnvelopeStatus.js
│           │   │   └── cosealEnvelopeStatus.js-meta.xml
│           │   └── cosealConfig/                 # Admin config component
│           │       ├── cosealConfig.html
│           │       ├── cosealConfig.js
│           │       └── cosealConfig.js-meta.xml
│           ├── objects/
│           │   └── CoSeal_Settings__c/           # Custom settings for API URL + key
│           │       ├── CoSeal_Settings__c.object-meta.xml
│           │       └── fields/
│           │           ├── API_URL__c.field-meta.xml
│           │           ├── API_Key__c.field-meta.xml
│           │           └── Default_Template__c.field-meta.xml
│           ├── customMetadata/
│           │   └── CoSeal_Field_Mapping.md       # Mapping Salesforce fields → CoSeal merge fields
│           └── permissionsets/
│               ├── CoSeal_Admin.permissionset-meta.xml
│               └── CoSeal_User.permissionset-meta.xml
├── sfdx-project.json
└── README.md                                     # Salesforce-specific setup guide
```

### 31.2 Core Apex Service (`CoSealService.cls`)

```apex
public with sharing class CoSealService {
    
    // Create and send an envelope from a Salesforce record
    public static String sendForSignature(
        Id recordId,
        String templateId,
        List<SignerInfo> signers,
        Map<String, String> mergeData
    ) {
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        String endpoint = settings.API_URL__c + '/api/envelopes/generate';
        
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);
        req.setHeader('Content-Type', 'application/json');
        
        // Build request body
        Map<String, Object> body = new Map<String, Object>{
            'templateId' => templateId,
            'mergeData' => mergeData,
            'signers' => signers,
            'metadata' => new Map<String, Object>{
                'salesforce_record_id' => recordId,
                'salesforce_object_type' => recordId.getSObjectType().getDescribe().getName()
            },
            'webhookUrl' => URL.getOrgDomainUrl().toExternalForm() + '/services/apexrest/coseal/webhook'
        };
        
        req.setBody(JSON.serialize(body));
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        
        if (res.getStatusCode() == 200 || res.getStatusCode() == 201) {
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            Map<String, Object> data = (Map<String, Object>) result.get('data');
            return (String) data.get('id'); // Return envelope ID
        } else {
            throw new CoSealException('Failed to create envelope: ' + res.getBody());
        }
    }
    
    // Get signing URL for embedded signing within Salesforce
    public static String getEmbeddedSigningUrl(String envelopeId, String signerEmail) {
        // Call CoSeal API to get a signing URL
        // Returns URL that can be loaded in an iframe within Salesforce
    }
    
    // Get envelope status
    public static Map<String, Object> getEnvelopeStatus(String envelopeId) {
        // GET /api/envelopes/:id
    }
    
    // Auto-populate merge data from a Salesforce record
    public static Map<String, String> buildMergeData(Id recordId, Map<String, String> fieldMapping) {
        // Query the record and map Salesforce fields to CoSeal merge fields
        // e.g., { 'Account.Name' => 'client_name', 'Opportunity.Amount' => 'amount' }
        SObject record = Database.query(
            'SELECT ' + String.join(new List<String>(fieldMapping.keySet()), ',') +
            ' FROM ' + recordId.getSObjectType().getDescribe().getName() +
            ' WHERE Id = :recordId'
        );
        
        Map<String, String> mergeData = new Map<String, String>();
        for (String sfField : fieldMapping.keySet()) {
            Object value = record.get(sfField);
            mergeData.put(fieldMapping.get(sfField), value != null ? String.valueOf(value) : '');
        }
        return mergeData;
    }
    
    public class SignerInfo {
        public String email;
        public String name;
        public String role;
        public Integer signingOrder;
    }
    
    public class CoSealException extends Exception {}
}
```

### 31.3 Webhook Handler (`CoSealWebhookHandler.cls`)

```apex
@RestResource(urlMapping='/coseal/webhook')
global with sharing class CoSealWebhookHandler {
    
    @HttpPost
    global static void handleWebhook() {
        RestRequest req = RestContext.request;
        String body = req.requestBody.toString();
        
        // Verify HMAC signature (from webhook header)
        String signature = req.headers.get('X-CoSeal-Signature');
        // ... verify signature ...
        
        Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(body);
        String eventType = (String) payload.get('event');
        Map<String, Object> data = (Map<String, Object>) payload.get('data');
        Map<String, Object> metadata = (Map<String, Object>) data.get('metadata');
        
        String recordId = (String) metadata.get('salesforce_record_id');
        
        if (eventType == 'envelope.completed') {
            // 1. Download sealed PDF from CoSeal
            // 2. Attach to Salesforce record as ContentVersion/ContentDocumentLink
            // 3. Update status field on the record (if configured)
            attachCompletedDocument(recordId, data);
        } else if (eventType == 'envelope.declined') {
            // Update status field
            updateRecordStatus(recordId, 'Declined');
        } else if (eventType == 'envelope.voided') {
            updateRecordStatus(recordId, 'Voided');
        }
        
        RestContext.response.statusCode = 200;
    }
    
    private static void attachCompletedDocument(String recordId, Map<String, Object> data) {
        // Download sealed PDF from CoSeal API
        String envelopeId = (String) data.get('id');
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        
        HttpRequest req = new HttpRequest();
        req.setEndpoint(settings.API_URL__c + '/api/envelopes/' + envelopeId + '/download');
        req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);
        req.setMethod('GET');
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        
        if (res.getStatusCode() == 200) {
            // Create ContentVersion (Salesforce Files)
            ContentVersion cv = new ContentVersion();
            cv.Title = 'Signed - ' + (String) data.get('subject');
            cv.PathOnClient = 'signed_document.pdf';
            cv.VersionData = res.getBodyAsBlob();
            insert cv;
            
            // Link to the record
            ContentVersion inserted = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id];
            ContentDocumentLink cdl = new ContentDocumentLink();
            cdl.ContentDocumentId = inserted.ContentDocumentId;
            cdl.LinkedEntityId = recordId;
            cdl.ShareType = 'V';
            insert cdl;
        }
    }
    
    private static void updateRecordStatus(String recordId, String status) {
        // Update a custom field on the record if configured
        // e.g., Opportunity.CoSeal_Status__c = 'Completed'
    }
}
```

### 31.4 LWC — Send for Signature Button (`cosealSendButton`)

```javascript
// cosealSendButton.js
import { LightningElement, api, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import sendForSignature from '@salesforce/apex/CoSealEnvelopeController.sendForSignature';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class CosealSendButton extends LightningElement {
    @api recordId;
    @api objectApiName;
    
    isLoading = false;
    showModal = false;
    signerEmail = '';
    signerName = '';
    selectedTemplate = '';
    
    handleSend() {
        this.isLoading = true;
        sendForSignature({
            recordId: this.recordId,
            templateId: this.selectedTemplate,
            signerEmail: this.signerEmail,
            signerName: this.signerName
        })
        .then(result => {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Success',
                message: 'Document sent for signature',
                variant: 'success'
            }));
            this.showModal = false;
        })
        .catch(error => {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body.message,
                variant: 'error'
            }));
        })
        .finally(() => {
            this.isLoading = false;
        });
    }
}
```

### 31.5 LWC — Envelope Status Tracker (`cosealEnvelopeStatus`)

A component that sits on the record page and shows the current signing status:
- Progress bar: Draft → Sent → In Progress → Completed
- List of signers with their status (signed ✅, pending ⏳, declined ❌)
- "Remind" button for pending signers
- "Download" button for completed envelopes
- Auto-refreshes via polling (every 30 seconds) or platform events

### 31.6 Field Mapping Configuration

Create a custom metadata type `CoSeal_Field_Mapping__mdt` that maps Salesforce fields to CoSeal merge fields per template:

| Salesforce Field | CoSeal Merge Field | Template |
|---|---|---|
| `Account.Name` | `client_name` | NDA Template |
| `Opportunity.Amount` | `contract_amount` | SOW Template |
| `Contact.Email` | `signer_email` | All |
| `Contact.Name` | `signer_name` | All |
| `Opportunity.CloseDate` | `effective_date` | SOW Template |

This allows admins to configure per-template mappings without code changes.

### 31.7 CoSeal API Requirements

To support the Salesforce package, ensure the main CoSeal API has:

1. **Embedded signing URL endpoint** (already in Step 20 SDK):
   - `POST /api/envelopes/:id/embedded-signing` — returns a short-lived URL that can be loaded in an iframe
   - The URL includes the signer's token and a `returnUrl` parameter for post-signing redirect
   - Response: `{ url: "https://coseal.example.com/sign/TOKEN?embed=true&returnUrl=..." }`

2. **Metadata pass-through** (already in schema):
   - `envelopes.metadata` JSONB stores `salesforce_record_id` and `salesforce_object_type`
   - Webhooks include metadata in the payload so the Salesforce handler can identify the record

3. **CORS configuration**:
   - Add Salesforce domains to CORS allowlist for embedded signing
   - `*.force.com`, `*.salesforce.com`, `*.lightning.force.com`

### 31.8 Setup Guide (for salesforce/README.md)

1. Install the CoSeal package from AppExchange (or deploy via SFDX)
2. Go to Setup → Custom Settings → CoSeal Settings → New
   - API URL: `https://your-coseal-instance.com` (your self-hosted CoSeal URL)
   - API Key: your CoSeal API key
3. Assign permission sets: `CoSeal Admin` for admins, `CoSeal User` for senders
4. Add the `cosealSendButton` component to Opportunity/Account/Contact record pages via Lightning App Builder
5. Add the `cosealEnvelopeStatus` component to the same record pages
6. Configure field mappings in Custom Metadata → CoSeal Field Mapping
7. Configure a webhook in CoSeal pointing to: `https://your-org.my.salesforce.com/services/apexrest/coseal/webhook`
8. Test: open an Opportunity → click "Send for Signature" → verify envelope created and status tracking works

### 31.9 Tests

Write Apex test classes with 75%+ coverage (Salesforce deployment requirement):
- `CoSealServiceTest.cls`:
  - Mock HTTP callouts using `HttpCalloutMock`
  - Test: create envelope → verify correct API call made
  - Test: build merge data from Opportunity → verify field mapping
  - Test: get status → verify response parsing
- `CoSealWebhookHandlerTest.cls`:
  - Test: receive completed webhook → verify ContentVersion created and linked
  - Test: receive declined webhook → verify status field updated
  - Test: invalid signature → verify 401 response

---

## Step 32 — Expanded Branding / White-Label Configuration

**Extends:** Step 10 (Branding enforcement)
**Goal:** For enterprise entitlement holders, allow full branding customization beyond just hiding CoSeal marks.
**Model:** Sonnet

1. Create `branding_config` table:
   ```sql
   CREATE TABLE branding_config (
       id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       logo_url        TEXT,            -- Custom logo URL
       logo_data       BYTEA,           -- Or base64 logo stored directly
       primary_color   TEXT DEFAULT '#2563EB',  -- Brand primary color (hex)
       secondary_color TEXT DEFAULT '#1E40AF',
       accent_color    TEXT DEFAULT '#3B82F6',
       company_name    TEXT,            -- Replaces "CoSeal" in UI
       email_footer    TEXT,            -- Custom email footer text
       signing_header  TEXT,            -- Custom text above signing area
       favicon_url     TEXT,
       custom_css      TEXT,            -- Additional CSS overrides (sandboxed)
       created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```

2. Create `GET /api/admin/branding` and `PUT /api/admin/branding` endpoints:
   - Only accessible when `COSEAL_BRANDING_ENTITLEMENT` is set (403 otherwise)
   - `PUT` accepts logo upload (multipart form), colors, company name, custom text
   - Validate: primary_color is valid hex, logo is PNG/SVG/JPG under 500KB

3. Update `CoSealBranding.tsx` component:
   - If entitlement key is present AND branding config exists: render custom branding
   - If entitlement key is present but no config: render nothing (clean white-label)
   - If no entitlement key: render default CoSeal branding (existing behavior)

4. Update email templates to pull branding config:
   - Logo in header
   - Custom company name
   - Custom footer text
   - Custom colors in template CSS

5. Update Certificate of Completion to use custom branding when configured.

6. Write tests:
   - Without entitlement: default CoSeal branding renders, PUT /branding returns 403
   - With entitlement: custom branding renders, PUT /branding succeeds
   - Email templates use custom logo and colors

---

## Implementation Priority

Execute these steps in this order for maximum impact:

| Priority | Step | What | Effort | Why First |
|----------|------|------|--------|-----------|
| 1 | 24 | Delegated signing + custody transfer | 1.5 days | Table-stakes for enterprise — common DocuSign workflow |
| 2 | 26 | Delayed routing | 0.5 day | Trivial to add, closes a visible gap in the feature matrix |
| 3 | 25 | Locked templates + shared folders | 1.5 days | Required for multi-user deployments |
| 4 | 29 | Document generation / mail merge | 2 days | Unlocks bulk send's full potential |
| 5 | 27 | RBAC | 3 days | Critical for enterprise adoption — gating feature for security teams |
| 6 | 30 | Team reports + enhanced analytics | 1.5 days | Required for admin visibility |
| 7 | 28 | Collaborative commenting | 3 days | Differentiator for negotiation workflows |
| 8 | 32 | Expanded branding | 1 day | Enterprise white-label requirement |
| 9 | 31 | CoSeal for Salesforce | 5 days | Major competitive differentiator — matches DocuSign's stickiest integration |

**Total estimated effort: ~19 days**

---

## Model Recommendations

| Step | Model | Rationale |
|------|-------|-----------|
| 24 | Sonnet | Straightforward CRUD + token management |
| 25 | Sonnet | Simple schema additions + CRUD |
| 26 | Sonnet | Minor workflow engine extension |
| 27 | **Opus** | Complex middleware + permission matrix + SSO integration |
| 28 | **Opus** | Multi-component UI with real-time updates + notification logic |
| 29 | Sonnet | PDF text manipulation + API endpoint |
| 30 | Sonnet | SQL aggregation queries + dashboard UI |
| 31 | **Opus** | Cross-platform integration (Apex + LWC + CoSeal API coordination) |
| 32 | Sonnet | Config-driven UI theming |

---

## Updated Parity Score

With BUILD_RECIPE (Steps 1-23): **86/95 features — 91%**

With BUILD_RECIPE_EXTENSION (Steps 24-32): **95/95 features — 100%**

Remaining items that are legitimately separate products (not features): Remote Online Notarization, full CLM/Navigator, Maestro no-code builder, DocuSign Monitor security suite, native mobile apps, 1000+ integrations marketplace.
