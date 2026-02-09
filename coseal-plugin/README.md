# CoSeal Cowork Plugin

## Overview

The **CoSeal Cowork Plugin** brings electronic signature capabilities directly into Claude. Work with contracts using the Legal plugin, then seamlessly send them for signature—all without leaving your conversation.

**Review → Redline → Sign → Seal** — The complete contract lifecycle in Claude.

## Features

- ✍️ **Send for signature** with intelligent field placement
- 📊 **Track signing progress** in real-time
- 🔔 **Send reminders** to pending signers
- 📥 **Download signed PDFs** with cryptographic seals
- 🗂️ **Create reusable templates** for frequently-used documents
- 📧 **Bulk send** to multiple recipients at once
- 📈 **View analytics** on signing activity

## Installation

### Prerequisites

1. **CoSeal Service**: You need a running CoSeal service (local or remote). See the [main README](../README.md) for deployment instructions.

2. **API Key**: Generate an API key from your CoSeal service.

### Install the Plugin

1. Copy the `coseal-plugin/` directory to your Cowork plugins directory:

   ```bash
   cp -r coseal-plugin/ ~/.cowork/plugins/coseal/
   ```

2. Configure the connection in `.mcp.json` (in the plugin directory):

   ```json
   {
     "mcpServers": {
       "coseal-service": {
         "type": "http",
         "url": "http://localhost:3000",
         "auth": {
           "type": "bearer",
           "token": "your-api-key-here"
         }
       }
     }
   }
   ```

   Or set environment variables:

   ```bash
   export COSEAL_SERVICE_URL=http://localhost:3000
   export COSEAL_API_KEY=your-api-key-here
   ```

3. Restart Claude or reload plugins.

## Usage

### Send a Document for Signature

```
/coseal:send @contract.pdf
```

Claude will:
- Ask for signer names and emails
- Suggest signing order (sequential or parallel)
- Intelligently place signature fields
- Send the envelope and provide a tracking ID

### Check Status

```
/coseal:status env_abc123
```

Or just:

```
/coseal:status
```

Claude will show the most recent envelope.

### Send a Reminder

```
/coseal:remind env_abc123
```

### Download Signed Document

```
/coseal:download env_abc123
```

Claude will download:
- The cryptographically sealed PDF
- The Certificate of Completion

### Void an Envelope

```
/coseal:void env_abc123
```

### Manage Templates

Create a reusable template:

```
/coseal:template create
```

List templates:

```
/coseal:template list
```

Send using a template:

```
/coseal:send --template "Standard NDA"
```

### Bulk Send

```
/coseal:bulk --template "Standard NDA" --recipients vendors.csv
```

Or just:

```
Send the NDA to alice@a.com, bob@b.com, charlie@c.com
```

### View Analytics

```
/coseal:analytics
```

## Commands Reference

| Command                     | Description                                    |
|-----------------------------|------------------------------------------------|
| `/coseal:send`              | Send a document for electronic signature       |
| `/coseal:status`            | Check the status of an envelope                |
| `/coseal:remind`            | Send a reminder to pending signers             |
| `/coseal:void`              | Cancel an envelope                             |
| `/coseal:download`          | Download signed document and certificate       |
| `/coseal:template`          | Create and manage reusable templates           |
| `/coseal:bulk`              | Send to multiple recipients at once            |
| `/coseal:analytics`         | View signing activity and statistics           |

## Skills

The plugin includes four skills that teach Claude about e-signatures:

1. **Signing Workflow**: When to suggest signing, signing order, complete ceremony process
2. **Field Placement**: How to intelligently place signature fields on documents
3. **Signer Routing**: Sequential vs parallel vs conditional routing
4. **Audit & Compliance**: ESIGN Act, UETA, eIDAS, legal validity, audit trails

Claude uses these skills to provide intelligent, context-aware assistance.

## Example Workflows

### Scenario 1: Quick NDA

**You:** "I need Alice and Bob to sign this NDA"

**Claude:**
1. Identifies `nda.pdf` in your workspace
2. Suggests parallel signing (since it's a mutual NDA)
3. Places signature fields intelligently
4. Sends envelope
5. Responds: "✓ Sent for signature. Both parties will receive links now."

### Scenario 2: Employment Agreement

**You:** "Send the employment agreement to jane@example.com"

**Claude:**
1. Recognizes it's an employment agreement (sequential signing typical)
2. Asks: "Should Jane sign first, then a manager countersigns?"
3. You: "Yes, I'll countersign after Jane."
4. Claude sends with sequential order: Jane → You
5. Tracks progress and notifies you when Jane signs

### Scenario 3: Approval Workflow

**You:** "I need approval signatures from the VP, CFO, and CEO in that order"

**Claude:**
1. Creates envelope with sequential routing: VP → CFO → CEO
2. Sends to VP immediately
3. After VP signs, sends to CFO
4. After CFO signs, sends to CEO
5. After CEO signs, notifies you: "✓ All approvals complete. Downloading signed document."

## Troubleshooting

### "Cannot connect to CoSeal service"

- Check that `COSEAL_SERVICE_URL` is correct
- Verify the service is running: `curl http://localhost:3000/health`
- Check network connectivity if using a remote service

### "Invalid API key"

- Verify `COSEAL_API_KEY` is set correctly
- Generate a new API key from the CoSeal admin panel

### "Document not found"

- Make sure the file is in your workspace or project directory
- Try referencing it explicitly: `/coseal:send @path/to/document.pdf`

### "Signer hasn't received email"

- Check spam folder
- Verify the email address is correct
- Resend by voiding and creating a new envelope, or use envelope correction

## Learn More

- **Main Documentation**: [CoSeal README](../README.md)
- **API Reference**: [docs/API.md](../docs/API.md)
- **Compliance Guide**: [docs/COMPLIANCE.md](../docs/COMPLIANCE.md)

## Support

- **GitHub Issues**: [github.com/coseal/coseal/issues](https://github.com/coseal/coseal/issues)
- **Discussions**: [github.com/coseal/coseal/discussions](https://github.com/coseal/coseal/discussions)

---

**Powered by CoSeal** — Open Source E-Signature Engine
