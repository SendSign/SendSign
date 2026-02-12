---
name: sendsign-usage
description: How to use SendSign for electronic signatures
---

# SendSign E-Signature

SendSign is an electronic signature platform. You have access to it via MCP tools.

## Available tools
- `create_envelope` — Create a new envelope (draft) with document and signers
- `send_envelope` — Send an envelope for signing
- `check_status` — Check envelope and signer status
- `list_envelopes` — List all envelopes with optional status filter
- `void_envelope` — Cancel a sent envelope
- `create_template` — Save a document layout as reusable template
- `list_templates` — Show available templates
- `use_template` — Create envelope from a template
- `send_reminder` — Remind pending signers
- `get_audit_trail` — Full audit timeline for an envelope
- `download_signed` — Get download URLs for signed document and certificate
- `bulk_send` — Send to multiple recipients at once
- `get_analytics` — Signing statistics
- `create_from_legal_review` — Create envelope from a Legal plugin review

## Common workflows

### Send a document for signature
1. User provides document + signer email(s)
2. Use `create_envelope` with the document and signers
3. If a template matches, fields are auto-placed → use `send_envelope`
4. If no template, give the user the prepare link to place fields manually
5. After fields placed, use `send_envelope`

### Check on sent documents
1. Use `list_envelopes` with status filter or `check_status` with envelope ID
2. Report per-signer status

### Template workflow (most common after initial setup)
1. User says "send using the Standard NDA template to jane@acme.com"
2. Use `list_templates` to find the template
3. Use `use_template` with signer details
4. Fields are auto-placed from template → use `send_envelope`
5. Done — fully automatic

## Field placement
- Templates: fully automatic (best experience)
- Text anchors: looks for "Signature: ___" patterns in the document (automatic)
- Manual: provide prepare page link, user places fields in browser (30 seconds)
- Always offer to save as template after first manual placement

## Important notes
- All signatures are legally binding under ESIGN Act (US) and eIDAS (EU)
- Each signer must consent to electronic signatures before signing
- Signed documents include SHA-256 hash and completion certificate
- IP address and timestamp are recorded for audit trail
