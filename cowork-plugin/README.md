# SendSign Cowork Plugin

This directory contains the Cowork plugin for SendSign e-signatures.

## What is this?

A Cowork plugin that lets users drag-and-drop SendSign integration into Claude. Once installed, users can send documents for signature directly from their Claude conversations.

## Directory Structure

```
cowork-plugin/
├── template/                  # Plugin template files
│   └── .claude-plugin/       # The actual plugin directory
│       ├── plugin.json       # Plugin metadata
│       ├── .mcp.json         # MCP server config (with placeholders)
│       ├── commands/         # Slash commands for Claude
│       │   ├── send-for-signature.md
│       │   ├── check-status.md
│       │   └── create-template.md
│       └── skills/           # Background knowledge for Claude
│           └── sendsign-usage.md
│
├── dist/                     # Built plugin zips
│   └── sendsign-cowork-plugin.zip  (generic version for marketing site)
│
├── build-generic.sh          # Script to build the generic plugin
└── README.md                 # This file
```

## Two Versions of the Plugin

### 1. Personalized Plugin (via API)

**Endpoints:**
- `GET /api/plugin/cowork` — Requires full authentication (Bearer token + tenant context)
  - Uses tenant's subdomain URL (e.g., `https://acme.sendsign.dev`)
  - API key from Authorization header
  
- `GET /api/plugin/download` — Simpler auth (API key via query or header)
  - Uses main instance URL or BASE_URL env var
  - Accepts `?apiKey=YOUR_KEY` query param or `Authorization: Bearer` header

**Example:**
```bash
# Via query param
curl "https://sendsign.dev/api/plugin/download?apiKey=ss_live_abc123" \
  -o sendsign-plugin.zip

# Via Authorization header
curl -H "Authorization: Bearer ss_live_abc123" \
  "https://sendsign.dev/api/plugin/cowork" \
  -o sendsign-plugin.zip
```

**What it contains:**
- Real API key baked into `.mcp.json`
- Real SendSign URL (tenant subdomain or instance URL)
- Ready to drag-and-drop into Cowork — no manual configuration needed

### 2. Generic Plugin (pre-built)

**Built with:**
```bash
./cowork-plugin/build-generic.sh
```

**Output:** `cowork-plugin/dist/sendsign-cowork-plugin.zip`

**What it contains:**
- Placeholder values:
  - `{{SENDSIGN_URL}}` → `https://YOUR-SUBDOMAIN.sendsign.dev`
  - `{{API_KEY}}` → `YOUR_API_KEY_HERE`
- Users must manually edit `.mcp.json` after unzipping
- Hosted on the marketing site for download before signup

## How Users Install It

### Option A: Personalized (Recommended)

1. Log into SendSign dashboard
2. Click "Download Cowork Plugin" (calls `/api/plugin/cowork` or `/api/plugin/download`)
3. Unzip to get `.claude-plugin/` folder
4. Drag the folder into any Claude Cowork project
5. Done! No manual configuration needed.

### Option B: Generic (Marketing Site)

1. Download `sendsign-cowork-plugin.zip` from marketing site
2. Unzip to get `.claude-plugin/` folder
3. Edit `.claude-plugin/.mcp.json`:
   - Replace `YOUR-SUBDOMAIN` with your tenant slug
   - Replace `YOUR_API_KEY_HERE` with your API key
4. Drag the folder into any Claude Cowork project
5. Done!

## What the Plugin Does

Once installed, users can:

### Slash Commands

- `/send-for-signature` — Send a document for e-signature
- `/check-status` — Check status of sent documents
- `/create-template` — Save a document layout as a template

### Natural Language

Users can just say:
- "Send this NDA to jane@acme.com for signature"
- "Has the MSA been signed yet?"
- "Create a template from this offer letter"

### MCP Tools Available

The plugin gives Claude access to 14 SendSign MCP tools:

1. `create_envelope` — Create new envelope with document + signers
2. `send_envelope` — Send envelope for signing
3. `check_status` — Check envelope and signer status
4. `list_envelopes` — List all envelopes (with filters)
5. `void_envelope` — Cancel a sent envelope
6. `create_template` — Save document layout as template
7. `list_templates` — Show available templates
8. `use_template` — Create envelope from template
9. `send_reminder` — Remind pending signers
10. `get_audit_trail` — Full audit timeline
11. `download_signed` — Get signed document + certificate
12. `bulk_send` — Send to multiple recipients
13. `get_analytics` — Signing statistics
14. `create_from_legal_review` — Create envelope from Legal plugin review

## Technical Details

### .mcp.json Format

```json
{
  "mcpServers": {
    "sendsign": {
      "url": "https://acme.sendsign.dev/mcp/sse",
      "headers": {
        "Authorization": "Bearer ss_live_abc123..."
      }
    }
  }
}
```

The plugin connects to SendSign's MCP server via Server-Sent Events (SSE) transport.

### plugin.json Format

```json
{
  "name": "SendSign E-Signature",
  "description": "Send documents for legally-binding electronic signature directly from Cowork",
  "version": "1.0.0",
  "author": "SendSign",
  "homepage": "https://sendsign.dev"
}
```

### Skills File

The `skills/sendsign-usage.md` file is the most important part of the plugin. It teaches Claude:

- What SendSign is and what it does
- All available MCP tools and their parameters
- Common workflows (send document, check status, use templates)
- Field placement strategies (templates, text anchors, manual)
- Legal compliance notes (ESIGN Act, eIDAS)

Claude reads this file automatically when the plugin is loaded and uses it to understand how to help users with e-signatures.

## Building the Generic Plugin

To rebuild the generic plugin (e.g., after updating template files):

```bash
cd cowork-plugin
./build-generic.sh
```

This outputs to `dist/sendsign-cowork-plugin.zip` with placeholder values.

## Testing

### Test the API Endpoints

```bash
# Info endpoint (no auth)
curl http://localhost:3000/api/plugin/info | python3 -m json.tool

# Download endpoint (with API key)
curl "http://localhost:3000/api/plugin/download?apiKey=ss_live_test" \
  -o test-plugin.zip

# Verify contents
unzip -l test-plugin.zip
unzip -p test-plugin.zip .claude-plugin/.mcp.json
```

### Test the Generic Build

```bash
# Build
./cowork-plugin/build-generic.sh

# Extract and verify
unzip -d /tmp/test cowork-plugin/dist/sendsign-cowork-plugin.zip
cat /tmp/test/.claude-plugin/.mcp.json

# Should show placeholder values:
# - https://YOUR-SUBDOMAIN.sendsign.dev
# - YOUR_API_KEY_HERE
```

## Integration with Dashboard

Add a "Download Cowork Plugin" button to the SendSign dashboard:

```javascript
<a href="/api/plugin/cowork" download="sendsign-cowork-plugin.zip">
  Download Cowork Plugin
</a>
```

Or with JavaScript:

```javascript
async function downloadPlugin() {
  const response = await fetch('/api/plugin/cowork', {
    headers: {
      'Authorization': `Bearer ${userApiKey}`
    }
  });
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sendsign-cowork-plugin.zip';
  a.click();
}
```

## Updating the Plugin

To update the plugin (e.g., add new commands or tools):

1. Edit files in `template/.claude-plugin/`
2. Rebuild the generic version: `./build-generic.sh`
3. The API endpoints will automatically serve the updated version
4. Increment version in `plugin.json`

## Support

- Homepage: https://sendsign.dev
- Documentation: https://docs.sendsign.dev
- Support: support@sendsign.dev

## License

BSD-3-Clause (same as SendSign)
