# SendSign for Salesforce

Send documents for e-signature directly from Salesforce records. SendSign for Salesforce matches DocuSign's AppExchange integration with full lifecycle management.

## Features

- **Send for Signature** button on Opportunity, Account, Contact, Contract, and Lead record pages
- **Auto-populate** signer fields from Salesforce contact data using field mappings
- **Embedded signing** within Salesforce via iframe
- **Auto-sync**: completed PDFs are automatically attached to the originating record
- **Status tracking** with progress bar and signer status on record pages
- **Reminders** for pending signers
- **Template selection** with pre-configured merge field mappings

## Prerequisites

1. A running SendSign instance (self-hosted or managed)
2. A SendSign API key
3. Salesforce org (Developer, Sandbox, or Production)
4. SFDX CLI installed (for deployment)

## Installation

### Option 1: Deploy via SFDX

```bash
# Clone the SendSign repository
git clone https://github.com/ianquackenbos/SendSign.git
cd SendSign/salesforce

# Authenticate with your Salesforce org
sfdx auth:web:login -a myOrg

# Deploy to your org
sfdx force:source:deploy -p force-app -u myOrg
```

### Option 2: Deploy via Metadata API

```bash
sfdx force:mdapi:deploy -d force-app/main/default -u myOrg -w 10
```

## Configuration

### 1. Set Up Custom Settings

1. Go to **Setup** → **Custom Settings** → **SendSign Settings** → **Manage**
2. Click **New** (or **Edit** if updating)
3. Fill in:
   - **API URL**: `https://your-sendsign-instance.com` (your SendSign base URL)
   - **API Key**: Your SendSign API key (generate from SendSign admin panel)
   - **Default Template** *(optional)*: UUID of a default template

### 2. Assign Permission Sets

1. Go to **Setup** → **Permission Sets**
2. Assign **SendSign Admin** to administrators who need to configure settings
3. Assign **SendSign User** to users who need to send documents for signature

### 3. Add Components to Record Pages

1. Go to an **Opportunity** (or Account/Contact) record page
2. Click **Setup** → **Edit Page** (Lightning App Builder)
3. Drag the **SendSign Send Button** component to the page
4. Drag the **SendSign Envelope Status** component to the page
5. Save and activate the page

### 4. Configure Field Mappings

1. Go to **Setup** → **Custom Metadata Types** → **SendSign Field Mapping** → **Manage Records**
2. Create mappings for your templates:

| Salesforce Field | SendSign Merge Field | Template |
|---|---|---|
| `Name` | `client_name` | All |
| `Amount` | `contract_amount` | (your template ID) |
| `CloseDate` | `effective_date` | (your template ID) |

### 5. Configure Webhook in SendSign

In your SendSign admin panel, add a webhook pointing to:

```
https://your-org.my.salesforce.com/services/apexrest/sendsign/webhook
```

This enables automatic document attachment and status updates when signing is complete.

### 6. Add SendSign to CORS Allowlist

In your SendSign instance configuration, add these Salesforce domains to CORS:

```
*.force.com
*.salesforce.com
*.lightning.force.com
```

## Components

### SendSign Send Button (`sendsignSendButton`)

A button component for record pages. Opens a modal to:
- Select a template
- Enter signer email and name
- Send the document for signature

**Supported objects**: Account, Contact, Opportunity, Contract, Lead

### SendSign Envelope Status (`sendsignEnvelopeStatus`)

A status tracker component for record pages. Shows:
- Progress bar: Draft → Sent → In Progress → Completed
- Signer list with status badges (Signed, Pending, Declined)
- Remind button for pending signers
- Download button for completed envelopes
- Void button for canceling in-progress envelopes
- Auto-refreshes every 30 seconds

### SendSign Signing Embed (`sendsignSigningEmbed`)

An embedded signing component that loads the SendSign signing interface in an iframe within Salesforce. Listens for `postMessage` events for completion/decline.

### SendSign Config (`sendsignConfig`)

An admin configuration component. Provides:
- API URL and Key input
- Default template selection
- Connection test button
- Settings save

## Apex Classes

| Class | Purpose |
|---|---|
| `SendSignService` | Core HTTP service — envelope creation, status, download |
| `SendSignEnvelopeController` | LWC controller — @AuraEnabled methods |
| `SendSignWebhookHandler` | REST endpoint for inbound webhooks |
| `SendSignConfig` | Settings accessor and connection testing |
| `SendSignServiceTest` | Unit tests with HTTP mocks (75%+ coverage) |
| `SendSignWebhookHandlerTest` | Webhook handler tests |

## How It Works

### Sending a Document

1. User clicks "Send for Signature" on a record page
2. Selects a template and enters signer info
3. `SendSignEnvelopeController` calls `SendSignService.sendForSignature()`
4. SendSign API creates an envelope with merge data from the Salesforce record
5. Signer receives email notification from SendSign

### Webhook Flow

1. Signer completes signing in SendSign
2. SendSign sends a webhook to `https://org.salesforce.com/services/apexrest/sendsign/webhook`
3. `SendSignWebhookHandler` receives the event
4. Verifies HMAC signature
5. Downloads the sealed PDF from SendSign
6. Attaches it to the Salesforce record as a File (ContentVersion)
7. Updates `SendSign_Status__c` field if present

### Embedded Signing

1. Use the `sendsignSigningEmbed` component with an envelope ID
2. Component calls `SendSignService.getEmbeddedSigningUrl()`
3. Loads SendSign signing UI in an iframe
4. Listens for `postMessage` events for completion

## Testing

```bash
# Run all tests
sfdx force:apex:test:run -n "SendSignServiceTest,SendSignWebhookHandlerTest" -r human -u myOrg

# Check code coverage
sfdx force:apex:test:run -n "SendSignServiceTest,SendSignWebhookHandlerTest" -c -r human -u myOrg
```

## Troubleshooting

### "SendSign API URL is not configured"
Go to Setup → Custom Settings → SendSign Settings and configure your API URL and key.

### Webhook not receiving events
1. Verify the webhook URL is correct in SendSign settings
2. Check that the SendSign REST resource is accessible (no IP restrictions)
3. Ensure the user has the `SendSign Admin` permission set

### CORS errors with embedded signing
Add your Salesforce domains to the SendSign CORS allowlist (see Configuration step 6).

### "No Apex class named SendSignService found"
Ensure you've deployed all classes and assigned the appropriate permission set.

## License

BSD-3-Clause — Same as the SendSign project.

## Support

- **SendSign Docs**: [https://github.com/ianquackenbos/SendSign](https://github.com/ianquackenbos/SendSign)
- **Issues**: [https://github.com/ianquackenbos/SendSign/issues](https://github.com/ianquackenbos/SendSign/issues)
