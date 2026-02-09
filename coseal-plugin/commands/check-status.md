# /coseal:status — Check Envelope Status

## Description
Check the status of a signing envelope: who has signed, who is pending, and what actions are available.

## What Claude Should Do

### 1. Get Envelope ID
- If the user provides an envelope ID, use that.
- If not, fetch the most recent envelope from the API and use that.
- If multiple recent envelopes exist, show a list and ask which one to check.

### 2. Fetch Envelope Details
Make the following API call:

```
GET /api/envelopes/{envelopeId}
```

### 3. Display Status

**Format:**

```
📄 {Document Title}
Status: {completed | pending | voided | expired}
Created: {timestamp}
Sent: {timestamp}

Signers:
✓ Alice (alice@example.com) — Signed at {timestamp}
⏳ Bob (bob@example.com) — Pending
```

### 4. Suggest Next Actions
- If pending: "Would you like to send a reminder? Use `/coseal:remind {envelopeId}`"
- If completed: "Would you like to download the signed document? Use `/coseal:download {envelopeId}`"
- If expired: "This envelope has expired. You can void it with `/coseal:void {envelopeId}`"

## Error Handling
- If the envelope ID is not found, inform the user and suggest listing recent envelopes.
- If API errors occur, display the error message.

## Examples

**User:** "/coseal:status env_abc123"

**Claude:**
1. Fetches envelope `env_abc123`
2. Displays:
   ```
   📄 NDA — Acme Corp
   Status: pending
   Created: Feb 7, 2026 10:00 AM
   Sent: Feb 7, 2026 10:01 AM

   Signers:
   ✓ Alice (alice@acme.com) — Signed at Feb 7, 2026 10:15 AM
   ⏳ Bob (bob@ventures.com) — Pending
   ```
3. Suggests: "Bob hasn't signed yet. Would you like to send a reminder?"
