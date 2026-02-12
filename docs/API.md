# SendSign REST API Reference

## Base URL

```
http://localhost:3000/api
```

For production, use your deployed SendSign service URL.

## Authentication

All API endpoints (except health check) require authentication using a Bearer token.

**Header:**
```
Authorization: Bearer <your-api-key>
```

**Example:**
```bash
curl -H "Authorization: Bearer abc123..." http://localhost:3000/api/envelopes
```

## Error Format

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Common HTTP status codes:**
- `200 OK` — Request successful
- `201 Created` — Resource created successfully
- `400 Bad Request` — Invalid request parameters
- `401 Unauthorized` — Missing or invalid API key
- `404 Not Found` — Resource not found
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Server error

## Rate Limiting

- **API endpoints**: 100 requests per minute per IP
- **Signing endpoints**: 20 requests per minute per IP

When rate limited, you'll receive a `429` response with a `Retry-After` header.

---

## Endpoints

### Health Check

#### `GET /health`

Check if the service is running.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "0.1.0"
  }
}
```

---

## Envelopes

### Create Envelope

#### `POST /api/envelopes`

Create a new signing envelope with documents, signers, and fields.

**Authentication:** Required

**Request:**
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `subject` (string, required): Envelope title
  - `message` (string, optional): Message to signers
  - `signingOrder` (string, required): `"sequential"` | `"parallel"` | `"mixed"`
  - `signers` (JSON string, required): Array of signer objects
  - `fields` (JSON string, optional): Array of field objects
  - `documents` (file, required): PDF file(s) to sign
  - `expiresInDays` (number, optional): Days until expiration (default: 30)

**Signer object:**
```json
{
  "name": "Alice Smith",
  "email": "alice@example.com",
  "order": 1,
  "signingGroup": "legal",
  "notificationMethod": "email",
  "verificationLevel": "none"
}
```

**Field object:**
```json
{
  "type": "signature",
  "signer": "alice@example.com",
  "page": 2,
  "x": 10,
  "y": 20,
  "width": 35,
  "height": 8,
  "required": true,
  "label": "Your Signature"
}
```

**Field types:** `signature`, `initial`, `date`, `text`, `checkbox`, `radio`, `dropdown`, `number`, `currency`, `calculated`, `attachment`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "env_abc123",
    "subject": "NDA - Acme Corp",
    "status": "draft",
    "createdAt": "2026-02-07T10:00:00Z",
    "signers": [...],
    "fields": [...],
    "documents": [...]
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/envelopes \
  -H "Authorization: Bearer <api-key>" \
  -F "subject=NDA - Acme Corp" \
  -F "message=Please review and sign" \
  -F "signingOrder=sequential" \
  -F 'signers=[{"name":"Alice","email":"alice@example.com","order":1}]' \
  -F "documents=@nda.pdf"
```

---

### Get Envelope

#### `GET /api/envelopes/:id`

Retrieve details of a specific envelope.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "env_abc123",
    "subject": "NDA - Acme Corp",
    "status": "pending",
    "createdAt": "2026-02-07T10:00:00Z",
    "sentAt": "2026-02-07T10:01:00Z",
    "signers": [
      {
        "id": "signer_123",
        "name": "Alice",
        "email": "alice@example.com",
        "status": "completed",
        "signedAt": "2026-02-07T10:15:00Z"
      }
    ],
    "fields": [...],
    "documents": [...]
  }
}
```

---

### List Envelopes

#### `GET /api/envelopes`

List all envelopes with optional filtering.

**Authentication:** Required

**Query Parameters:**
- `status` (string, optional): Filter by status (`draft`, `sent`, `pending`, `completed`, `voided`, `expired`)
- `limit` (number, optional): Number of results (default: 50, max: 100)
- `offset` (number, optional): Pagination offset

**Response:**
```json
{
  "success": true,
  "data": {
    "envelopes": [...],
    "total": 42,
    "limit": 50,
    "offset": 0
  }
}
```

---

### Send Envelope

#### `POST /api/envelopes/:id/send`

Send an envelope to signers. This generates signing tokens and sends notifications.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "env_abc123",
    "status": "sent",
    "sentAt": "2026-02-07T10:01:00Z"
  }
}
```

---

### Void Envelope

#### `POST /api/envelopes/:id/void`

Cancel an envelope. Signers are notified and can no longer sign.

**Authentication:** Required

**Request Body:**
```json
{
  "reason": "Optional reason for voiding"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "env_abc123",
    "status": "voided",
    "voidedAt": "2026-02-07T12:00:00Z"
  }
}
```

---

### Correct Envelope

#### `POST /api/envelopes/:id/correct`

Modify an in-flight envelope (add/remove/update signers or fields).

**Authentication:** Required

**Request Body:**
```json
{
  "signers": {
    "add": [...],
    "remove": ["signer_id"],
    "update": [{ "id": "signer_id", "email": "newemail@example.com" }]
  },
  "fields": {
    "add": [...],
    "remove": ["field_id"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "env_abc123",
    "correctedAt": "2026-02-07T11:00:00Z"
  }
}
```

---

### Complete Envelope

#### `POST /api/envelopes/:id/complete`

Finalize an envelope after all signers have completed. This seals the document and generates the Certificate of Completion.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "env_abc123",
    "status": "completed",
    "completedAt": "2026-02-07T14:00:00Z",
    "sealedDocumentUrl": "/api/envelopes/env_abc123/download",
    "certificateUrl": "/api/envelopes/env_abc123/certificate"
  }
}
```

---

### Download Sealed Document

#### `GET /api/envelopes/:id/download`

Download the cryptographically sealed PDF with all signatures embedded.

**Authentication:** Required

**Response:** Binary PDF file

**Example:**
```bash
curl -H "Authorization: Bearer <api-key>" \
  http://localhost:3000/api/envelopes/env_abc123/download \
  -o signed-document.pdf
```

---

### Download Certificate of Completion

#### `GET /api/envelopes/:id/certificate`

Download the Certificate of Completion PDF containing the full audit trail.

**Authentication:** Required

**Response:** Binary PDF file

---

## Signing Ceremony

### Get Signing Session

#### `GET /api/sign/:token`

Retrieve signing session details for a signer using their unique signing token.

**Authentication:** Not required (token-based)

**Response:**
```json
{
  "success": true,
  "data": {
    "envelopeId": "env_abc123",
    "subject": "NDA - Acme Corp",
    "message": "Please review and sign",
    "signer": {
      "name": "Alice",
      "email": "alice@example.com"
    },
    "fields": [...],
    "documents": [...]
  }
}
```

---

### Submit Signed Fields

#### `POST /api/sign/:token`

Submit filled field values to complete signing.

**Authentication:** Not required (token-based)

**Request Body:**
```json
{
  "fields": [
    {
      "id": "field_123",
      "value": "data:image/png;base64,..."
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "signedAt": "2026-02-07T10:15:00Z"
  }
}
```

---

## Templates

### Create Template

#### `POST /api/templates`

Create a reusable signing template.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Standard NDA",
  "description": "Two-party mutual NDA",
  "signers": [
    { "role": "Party A", "order": 1 },
    { "role": "Party B", "order": 2 }
  ],
  "fields": [...],
  "document": "<base64-encoded-pdf>"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "template_abc123",
    "name": "Standard NDA",
    "createdAt": "2026-02-07T10:00:00Z"
  }
}
```

---

### List Templates

#### `GET /api/templates`

List all templates.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "template_abc123",
        "name": "Standard NDA",
        "description": "Two-party mutual NDA",
        "createdAt": "2026-02-07T10:00:00Z"
      }
    ]
  }
}
```

---

### Get Template

#### `GET /api/templates/:id`

Retrieve a specific template.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "template_abc123",
    "name": "Standard NDA",
    "description": "Two-party mutual NDA",
    "signers": [...],
    "fields": [...]
  }
}
```

---

### Delete Template

#### `DELETE /api/templates/:id`

Delete a template.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "template_abc123",
    "deleted": true
  }
}
```

---

## Webhooks

### Register Webhook

#### `POST /api/webhooks`

Register a webhook to receive event notifications.

**Authentication:** Required

**Request Body:**
```json
{
  "url": "https://your-server.com/webhook",
  "events": ["envelope.sent", "signer.signed", "envelope.completed"],
  "secret": "your-webhook-secret"
}
```

**Event types:**
- `envelope.created`
- `envelope.sent`
- `envelope.voided`
- `envelope.completed`
- `signer.viewed`
- `signer.signed`
- `signer.declined`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "webhook_abc123",
    "url": "https://your-server.com/webhook",
    "events": ["envelope.sent", "signer.signed", "envelope.completed"],
    "createdAt": "2026-02-07T10:00:00Z"
  }
}
```

---

### List Webhooks

#### `GET /api/webhooks`

List all registered webhooks.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "webhooks": [...]
  }
}
```

---

### Remove Webhook

#### `DELETE /api/webhooks/:id`

Remove a webhook.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "webhook_abc123",
    "deleted": true
  }
}
```

---

## Webhook Payload

When an event occurs, SendSign sends a POST request to your webhook URL:

```json
{
  "event": "signer.signed",
  "timestamp": "2026-02-07T10:15:00Z",
  "data": {
    "envelopeId": "env_abc123",
    "signerId": "signer_123",
    "signerName": "Alice",
    "signerEmail": "alice@example.com"
  }
}
```

**Headers:**
```
X-SendSign-Signature: sha256=<hmac-signature>
X-SendSign-Event: signer.signed
```

**Verifying webhook signatures:**

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

---

## Admin Analytics

### Get Analytics

#### `GET /api/admin/analytics`

Retrieve signing analytics and statistics.

**Authentication:** Required

**Query Parameters:**
- `period` (string, optional): `7d`, `30d`, `90d`, `all` (default: `30d`)

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalEnvelopes": 150,
      "completed": 120,
      "pending": 25,
      "voided": 5,
      "completionRate": 0.80,
      "avgTimeToComplete": "2.5 days"
    },
    "dailyCounts": [
      { "date": "2026-02-01", "sent": 5, "completed": 4 },
      { "date": "2026-02-02", "sent": 8, "completed": 6 }
    ],
    "statusBreakdown": [
      { "status": "completed", "count": 120 },
      { "status": "pending", "count": 25 },
      { "status": "voided", "count": 5 }
    ],
    "recentEvents": [
      {
        "envelopeId": "env_abc123",
        "action": "signed",
        "signer": "Alice",
        "timestamp": "2026-02-07T10:15:00Z"
      }
    ]
  }
}
```

---

## Retention Policies

### List Retention Policies

```
GET /api/retention/policies
```

**Response:**
```json
{
  "success": true,
  "data": {
    "policies": [
      {
        "id": "pol_abc123",
        "name": "Healthcare (HIPAA)",
        "description": "Healthcare records retention per HIPAA requirements",
        "retentionDays": 2555,
        "autoDelete": false
      }
    ],
    "presets": [
      { "id": "healthcare", "name": "Healthcare (HIPAA)", "retentionDays": 2555 },
      { "id": "financial", "name": "Financial Services (SEC/FINRA)", "retentionDays": 2555 },
      { "id": "tax", "name": "Tax Records (IRS)", "retentionDays": 2555 },
      { "id": "employment", "name": "Employment Records", "retentionDays": 1825 },
      { "id": "general", "name": "General Business", "retentionDays": 1095 },
      { "id": "gdpr_minimal", "name": "GDPR Minimal", "retentionDays": 365 }
    ]
  }
}
```

### Create Custom Policy

```
POST /api/retention/policies
```

**Request:**
```json
{
  "name": "Custom 10-year retention",
  "description": "Extended retention for critical agreements",
  "retentionDays": 3650,
  "autoDelete": false,
  "notifyBefore": 90
}
```

### Assign Policy to Envelope

```
POST /api/envelopes/:envelopeId/retention
```

**Request:**
```json
{
  "policyId": "pol_abc123"
}
```

### Get Expiring Documents

```
GET /api/retention/expiring?days=30
```

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 3,
    "documents": [
      {
        "envelopeId": "env_abc123",
        "subject": "NDA with Acme Corp",
        "expiryDate": "2026-03-15"
      }
    ]
  }
}
```

### Generate Retention Report

```
GET /api/retention/report
```

Downloads a PDF report of all documents and their retention status.

---

## Integrations

### List Available Integrations

```
GET /api/integrations
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "slack",
      "displayName": "Slack",
      "description": "Send notifications to Slack when documents are signed",
      "enabled": false
    },
    {
      "name": "box",
      "displayName": "Box",
      "description": "Automatically upload completed documents to Box",
      "enabled": true
    }
  ]
}
```

### Enable Integration

```
POST /api/integrations/:name
```

**Request:**
```json
{
  "config": {
    "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/..."
  }
}
```

### Disable Integration

```
DELETE /api/integrations/:name
```

### Test Integration Connection

```
POST /api/integrations/:name/test
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Successfully connected to Slack"
  }
}
```

---

## SSO Configuration

### Create/Update SSO Config

```
POST /api/sso/configurations
```

**Request (SAML):**
```json
{
  "organizationId": "org_abc123",
  "providerType": "saml",
  "config": {
    "entryPoint": "https://idp.example.com/sso/saml",
    "issuer": "https://idp.example.com",
    "callbackUrl": "https://sign.example.com/api/sso/callback",
    "cert": "-----BEGIN CERTIFICATE-----\n...",
    "allowedDomains": ["example.com"]
  },
  "enabled": true
}
```

**Request (OIDC):**
```json
{
  "organizationId": "org_abc123",
  "providerType": "oidc",
  "config": {
    "issuerUrl": "https://accounts.google.com",
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "allowedDomains": ["example.com"]
  },
  "enabled": true
}
```

### Get SSO Configuration

```
GET /api/sso/configurations/:orgId
```

### Delete SSO Configuration

```
DELETE /api/sso/configurations/:orgId
```

### Get SP Metadata (SAML)

```
GET /api/sso/metadata/:orgId
```

Returns SAML Service Provider metadata XML for IdP configuration.

### Detect SSO Availability

```
GET /api/sso/detect?email=user@example.com
```

**Response:**
```json
{
  "success": true,
  "data": {
    "ssoAvailable": true,
    "organizationId": "org_abc123",
    "loginUrl": "/api/sso/login/org_abc123"
  }
}
```

---

## Organizations (Multi-Tenant)

### Create Organization

```
POST /api/organizations
```

**Request:**
```json
{
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "plan": "enterprise",
  "billingEmail": "billing@acme.com"
}
```

### Get Organization

```
GET /api/organizations/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "org_abc123",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "plan": "enterprise",
    "envelopeLimit": null,
    "envelopesUsed": 42,
    "planDetails": {
      "name": "Enterprise",
      "envelopeLimit": null,
      "verificationLevels": ["simple", "advanced", "qualified"],
      "integrationsEnabled": true,
      "ssoEnabled": true
    }
  }
}
```

### Get Usage

```
GET /api/organizations/usage
```

**Response:**
```json
{
  "success": true,
  "data": {
    "organizationId": "org_abc123",
    "plan": "pro",
    "envelopesUsed": 42,
    "envelopeLimit": 100,
    "remaining": 58,
    "percentUsed": 42,
    "resetDate": "2026-03-01T00:00:00Z",
    "features": {
      "verificationLevels": ["simple", "advanced"],
      "integrationsEnabled": true,
      "ssoEnabled": false
    }
  }
}
```

### Generate API Key

```
POST /api/organizations/:id/api-keys
```

**Request:**
```json
{
  "name": "Production Key",
  "permissions": ["all"],
  "expiresInDays": 365
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "key_abc123",
    "key": "sendsign_0123456789abcdef...",
    "name": "Production Key",
    "expiresAt": "2027-02-07T00:00:00Z"
  }
}
```

**⚠️ The `key` field is only returned once. Store it securely.**

### List API Keys

```
GET /api/organizations/:id/api-keys
```

### Revoke API Key

```
DELETE /api/organizations/:id/api-keys/:keyId
```

### List Plan Tiers

```
GET /api/organizations/plans
```

---

## Document Generation / Mail Merge

### Generate Envelope from Template with Merge Data

```
POST /api/envelopes/generate
```

**Request body:**
```json
{
  "templateId": "uuid",
  "mergeData": {
    "client_name": "Acme Corp",
    "contract_date": "2026-02-08",
    "amount": "$50,000"
  },
  "signers": [
    {
      "email": "alice@acme.com",
      "name": "Alice",
      "order": 1
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "envelopeId": "uuid"
  }
}
```

Populates template placeholders like `{{client_name}}` with provided data before creating envelope.

### Bulk Send with Per-Recipient Merge Data

```
POST /api/envelopes/bulk
```

**Request body:**
```json
{
  "templateId": "uuid",
  "recipients": [
    {
      "email": "alice@acme.com",
      "name": "Alice",
      "mergeData": {
        "client_name": "Acme Corp",
        "amount": "$50,000"
      }
    },
    {
      "email": "bob@globex.com",
      "name": "Bob",
      "mergeData": {
        "client_name": "Globex Inc",
        "amount": "$75,000"
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "created": 2,
    "failed": 0,
    "envelopeIds": ["uuid1", "uuid2"],
    "errors": [],
    "batchId": "uuid"
  }
}
```

### Bulk Send from CSV Upload

```
POST /api/envelopes/bulk/csv
Content-Type: multipart/form-data
```

**Form fields:**
- `templateId`: Template UUID
- `csv`: CSV file with columns: `email,name,merge_field_1,merge_field_2,...`

**Example CSV:**
```csv
email,name,client_name,amount
alice@acme.com,Alice,Acme Corp,$50000
bob@globex.com,Bob,Globex Inc,$75000
```

**Response:**
```json
{
  "success": true,
  "data": {
    "created": 2,
    "failed": 0,
    "envelopeIds": ["uuid1", "uuid2"],
    "errors": [],
    "batchId": "uuid"
  }
}
```

### Get Bulk Send Status

```
GET /api/envelopes/bulk/:batchId/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 10,
    "completed": 7,
    "failed": 1,
    "inProgress": 2
  }
}
```

---

## Enhanced Analytics

### Get Analytics with Filters

```
GET /api/admin/analytics?userId=uuid&dateFrom=ISO&dateTo=ISO&groupBy=day
```

**Query parameters:**
- `userId` (optional): Filter to specific user
- `dateFrom` (optional): Start date (ISO 8601)
- `dateTo` (optional): End date (ISO 8601)
- `groupBy` (optional): Aggregation level (`day`, `week`, `month`, `user`)
- `period` (optional): Predefined period (`7d`, `30d`, `90d`, `all`)

**Response:** (same as base analytics endpoint, but filtered)

### Per-User Analytics

```
GET /api/admin/analytics/users?dateFrom=ISO&dateTo=ISO
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "userId": "uuid",
      "name": "Alice",
      "email": "alice@example.com",
      "sent": 45,
      "completed": 38,
      "avgTurnaround": "2.3h"
    },
    {
      "userId": "uuid",
      "name": "Bob",
      "email": "bob@example.com",
      "sent": 23,
      "completed": 20,
      "avgTurnaround": "5.1h"
    }
  ]
}
```

### Per-Template Analytics

```
GET /api/admin/analytics/templates?dateFrom=ISO&dateTo=ISO
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "templateId": "uuid",
      "name": "NDA",
      "timesUsed": 120,
      "completionRate": "94%",
      "avgTurnaround": "1.8h"
    },
    {
      "templateId": "uuid",
      "name": "SOW",
      "timesUsed": 45,
      "completionRate": "87%",
      "avgTurnaround": "8.2h"
    }
  ]
}
```

### Export Analytics

```
GET /api/admin/analytics/export?format=csv&type=users
```

**Query parameters:**
- `format`: Export format (`csv` or `pdf`)
- `type`: Export type (`summary`, `users`, `templates`)

**Response:** CSV or PDF file download

**CSV headers (users):**
```csv
User ID,Name,Email,Envelopes Sent,Completed,Avg Turnaround
uuid,Alice,alice@example.com,45,38,2.3h
```

**CSV headers (templates):**
```csv
Template ID,Name,Times Used,Completion Rate,Avg Turnaround
uuid,NDA,120,94%,1.8h
```

---

## SDKs

### TypeScript / Node.js SDK

The official SDK is available at **`@sendsign/sdk`**:

```bash
npm install @sendsign/sdk
```

**Quick example:**
```typescript
import { SendSignClient } from '@sendsign/sdk';
import fs from 'fs';

const sendsign = new SendSignClient({
  baseUrl: 'https://sign.yourcompany.com',
  apiKey: 'your-api-key',
});

const envelope = await sendsign.createEnvelope({
  document: fs.readFileSync('contract.pdf'),
  subject: 'Please sign the MSA',
  signers: [
    { email: 'alice@company.com', name: 'Alice', order: 1 },
  ],
});

await sendsign.sendEnvelope(envelope.id);
```

See `sdk/README.md` for full documentation.

---

## Embedded Signing (Salesforce / iframe)

### Get Embedded Signing URL

```
POST /api/envelopes/:id/embedded-signing
```

**Request body:**
```json
{
  "signerEmail": "alice@example.com",
  "returnUrl": "https://myorg.salesforce.com/opportunity/001..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://sendsign.example.com/sign/TOKEN?embed=true&returnUrl=...",
    "expiresAt": "2026-02-10T12:00:00Z"
  }
}
```

The returned URL can be loaded in an iframe for in-app signing (e.g., within Salesforce, custom portals).

---

## Branding / White-Label

### Get Branding Configuration

```
GET /api/admin/branding
```

**Response:**
```json
{
  "success": true,
  "data": {
    "primaryColor": "#2563EB",
    "secondaryColor": "#1E40AF",
    "accentColor": "#3B82F6",
    "companyName": "SendSign",
    "emailFooter": null,
    "signingHeader": null,
    "logoUrl": null,
    "faviconUrl": null,
    "customCss": null,
    "isDefault": true,
    "entitlementActive": false
  }
}
```

### Update Branding Configuration

```
PUT /api/admin/branding
```

**Requires:** `SENDSIGN_BRANDING_ENTITLEMENT` environment variable + admin role.

**Request body:**
```json
{
  "primaryColor": "#FF5722",
  "secondaryColor": "#E64A19",
  "accentColor": "#FF7043",
  "companyName": "Acme Corp",
  "emailFooter": "Powered by Acme Corp e-Signing",
  "signingHeader": "Welcome to Acme Corp Document Signing",
  "logoUrl": "https://acme.com/logo.png",
  "faviconUrl": "https://acme.com/favicon.ico",
  "customCss": ".header { background: #FF5722; }"
}
```

**Validation:**
- Colors must be valid hex (`#RRGGBB`)
- Logo data (base64) must be under 500KB
- Custom CSS is sanitized (no `<script>`, `javascript:`, `expression()`, `@import`)

### Reset Branding

```
DELETE /api/admin/branding
```

Resets all branding to SendSign defaults.

---

## Support

- **Documentation**: [https://github.com/sendsign/sendsign](https://github.com/sendsign/sendsign)
- **Issues**: [https://github.com/sendsign/sendsign/issues](https://github.com/sendsign/sendsign/issues)
- **Discussions**: [https://github.com/sendsign/sendsign/discussions](https://github.com/sendsign/sendsign/discussions)
