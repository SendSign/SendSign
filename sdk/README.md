# @sendsign/sdk

> Official SDK for SendSign — the open-source e-signature engine.

Send documents for legally binding electronic signatures from any Node.js or browser application.

## Installation

```bash
npm install @sendsign/sdk
```

## Quick Start

```typescript
import { SendSignClient } from '@sendsign/sdk';
import fs from 'fs';

const sendsign = new SendSignClient({
  baseUrl: 'https://sign.yourcompany.com',
  apiKey: 'your-api-key',
});

// Create and send an envelope
const envelope = await sendsign.createEnvelope({
  document: fs.readFileSync('contract.pdf'),
  subject: 'Please sign the MSA',
  signers: [
    { email: 'alice@company.com', name: 'Alice', order: 1 },
    { email: 'bob@vendor.com', name: 'Bob', order: 2 },
  ],
  fields: [
    { type: 'signature', page: 5, x: 60, y: 80, width: 25, height: 5, signerId: 0 },
    { type: 'signature', page: 5, x: 60, y: 90, width: 25, height: 5, signerId: 1 },
    { type: 'date', page: 5, x: 88, y: 80, width: 10, height: 3, signerId: 0 },
    { type: 'date', page: 5, x: 88, y: 90, width: 10, height: 3, signerId: 1 },
  ],
});

await sendsign.sendEnvelope(envelope.id);
console.log(`Envelope sent: ${envelope.id}`);
```

## API Reference

### Constructor

```typescript
const sendsign = new SendSignClient({
  baseUrl: string,      // Required: SendSign server URL
  apiKey: string,       // Required: API key
  timeout?: number,     // Optional: Request timeout in ms (default: 30000)
  fetch?: typeof fetch, // Optional: Custom fetch implementation
});
```

### Envelope Management

```typescript
// Create an envelope
const envelope = await sendsign.createEnvelope({ ... });

// Send for signing
await sendsign.sendEnvelope(envelope.id);

// Get envelope details
const details = await sendsign.getEnvelope(envelope.id);

// List envelopes with filters
const list = await sendsign.listEnvelopes({
  status: 'sent',
  page: 1,
  limit: 20,
});

// Void (cancel) an envelope
await sendsign.voidEnvelope(envelope.id, 'Incorrect terms');
```

### Signing

```typescript
// Get a signing URL for a specific signer
const url = await sendsign.getSigningUrl(envelopeId, signerId);
// Returns: "https://sign.yourcompany.com/sign/abc123..."
```

### Documents

```typescript
// Download sealed (signed) PDF
const sealedPdf = await sendsign.downloadSealed(envelopeId);
fs.writeFileSync('signed-contract.pdf', sealedPdf);

// Download completion certificate
const cert = await sendsign.downloadCertificate(envelopeId);
fs.writeFileSync('certificate.pdf', cert);
```

### Templates

```typescript
// Create a reusable template
const template = await sendsign.createTemplate({
  name: 'Standard NDA',
  document: fs.readFileSync('nda-template.pdf'),
  roles: [
    { name: 'Discloser', order: 1 },
    { name: 'Recipient', order: 2 },
  ],
});

// Use template to create envelope
const envelope = await sendsign.useTemplate(template.id, [
  { name: 'Alice', email: 'alice@company.com', order: 1 },
  { name: 'Bob', email: 'bob@vendor.com', order: 2 },
]);
```

### Audit Trail

```typescript
// Get audit trail as JSON
const auditJson = await sendsign.getAuditTrail(envelopeId, 'json');

// Get audit trail as CSV
const auditCsv = await sendsign.getAuditTrail(envelopeId, 'csv');
```

### Retention Policies

```typescript
// Assign a retention policy to an envelope
await sendsign.assignRetentionPolicy(envelopeId, policyId);
```

### Webhooks

```typescript
// Register a webhook
const webhook = await sendsign.registerWebhook(
  'https://yourapp.com/webhooks/sendsign',
  ['envelope.completed', 'signer.completed'],
);

// List webhooks
const webhooks = await sendsign.listWebhooks();

// Delete a webhook
await sendsign.deleteWebhook(webhook.id);
```

### Embedded Signing (Browser)

Embed the signing experience directly in your web application:

```typescript
const { destroy } = sendsign.embedSigning({
  containerId: 'signing-container',
  token: signerToken,
  onReady: () => console.log('Signing UI loaded'),
  onSigned: (data) => {
    console.log('Document signed!', data.envelopeId);
    // Redirect to success page
  },
  onDeclined: (data) => {
    console.log('Signer declined', data.reason);
  },
  onError: (error) => {
    console.error('Signing error:', error.message);
  },
});

// Clean up when done
destroy();
```

```html
<div id="signing-container" style="width: 100%; height: 600px;"></div>
```

## Error Handling

The SDK throws specific error types for different failure scenarios:

```typescript
import {
  SendSignError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
  TimeoutError,
  NetworkError,
} from '@sendsign/sdk';

try {
  await sendsign.getEnvelope('nonexistent-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Envelope not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof TimeoutError) {
    console.log('Request timed out');
  } else if (error instanceof NetworkError) {
    console.log('Network error — check connectivity');
  }
}
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  Envelope,
  EnvelopeStatus,
  Signer,
  SignerStatus,
  Field,
  FieldType,
  CreateEnvelopeInput,
  EnvelopeFilters,
  Template,
  Webhook,
  WebhookEvent,
  AuditEvent,
  EmbedOptions,
} from '@sendsign/sdk';
```

## Browser Support

The SDK works in both Node.js and browser environments:

- **Node.js**: >= 18 (uses native `fetch`)
- **Browsers**: All modern browsers with `fetch` support
- **Bundle formats**: ESM and CommonJS (dual package)

## License

BSD-3-Clause — see [LICENSE](../LICENSE) for details.
