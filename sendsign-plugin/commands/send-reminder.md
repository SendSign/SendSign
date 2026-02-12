# /sendsign:remind — Send Reminder

## Description
Send a reminder email to pending signers.

## What Claude Should Do

### 1. Get Envelope ID
- If the user provides an envelope ID, use that.
- If not, use the most recent pending envelope.

### 2. Send Reminder
Make the following API call:

```
POST /api/envelopes/{envelopeId}/remind
```

This endpoint regenerates expired signing tokens and re-sends notification emails to all pending signers.
Alias: `POST /api/envelopes/{envelopeId}/resend` (same functionality).

### 3. Confirm to the User
- Display: "✓ Reminder sent to {pending signer names}"

## Error Handling
- If the envelope is already completed, inform the user no reminder is needed.
- If the envelope is voided or expired, inform the user reminders cannot be sent.

## Examples

**User:** "/sendsign:remind env_abc123"

**Claude:**
1. Fetches envelope `env_abc123`
2. Identifies pending signers (Bob)
3. Sends reminder
4. Responds: "✓ Reminder sent to Bob (bob@ventures.com)"
