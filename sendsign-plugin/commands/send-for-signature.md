# /sendsign:send — Send for Signature

## Description
Send a document for electronic signatures. Claude will identify the document, collect signer information, intelligently place signature fields, and send the envelope.

## What Claude Should Do

### 1. Identify the Document
- If the user references a file in the workspace (`@filename.pdf`), use that.
- If the user just finished working with the Legal plugin (contract redlining), offer to use that output.
- If multiple documents are available, ask which one to send.

### 2. Collect Signer Information
- Ask for signer names and email addresses.
- Try to infer signers from contract context (e.g., "Acme Corp" and "John Smith" from a two-party agreement).
- Suggest signing order based on document type:
  - **Sequential** (one-by-one): typical for approvals, hierarchical signing
  - **Parallel** (all at once): typical for peer agreements, NDAs between equals

### 3. Place Signature Fields
- Use the field-placement skill to intelligently position fields:
  - **Signature fields** on the last page, in signature blocks
  - **Initial fields** on each page (if multi-page)
  - **Date fields** next to each signature
  - **Text fields** for titles, company names if the contract has blank spaces
- If the user specifies custom field placement, respect that.

### 4. Create and Send the Envelope
Make the following API calls via MCP:

```
POST /api/envelopes
{
  "subject": "Document Title",
  "message": "Optional message to signers",
  "signingOrder": "sequential" | "parallel",
  "signers": [
    { "name": "Alice", "email": "alice@example.com", "order": 1 },
    { "name": "Bob", "email": "bob@example.com", "order": 2 }
  ],
  "fields": [
    {
      "type": "signature",
      "signer": "alice@example.com",
      "page": 2,
      "x": 100,
      "y": 200,
      "width": 200,
      "height": 50
    }
  ],
  "documents": [<file upload>]
}
```

Then:

```
POST /api/envelopes/{envelopeId}/send
```

### 5. Confirm to the User
- Display: "✓ Sent for signature: {document title}"
- List signers and their signing order
- Provide the envelope ID for tracking: "Use `/sendsign:status {envelopeId}` to check progress"

## Error Handling
- If the document is not a PDF, inform the user SendSign currently only supports PDFs.
- If signer emails are invalid, ask for corrections.
- If API errors occur, display the error message and suggest troubleshooting (check API key, service URL).

## Examples

**User:** "Send this NDA to alice@acme.com and bob@ventures.com"

**Claude:**
1. Identifies `nda.pdf` in workspace
2. Creates envelope with 2 signers (parallel order since it's an NDA between peers)
3. Places signature fields on last page, date fields next to each signature
4. Sends envelope
5. Responds: "✓ Sent `nda.pdf` for signature. Alice and Bob will receive signing links via email. Envelope ID: `env_abc123`. Use `/sendsign:status env_abc123` to track progress."
