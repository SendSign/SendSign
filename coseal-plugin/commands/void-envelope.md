# /coseal:void — Void Envelope

## Description
Cancel an envelope and notify all signers that it's no longer valid.

## What Claude Should Do

### 1. Get Envelope ID
- If the user provides an envelope ID, use that.
- If not, ask which envelope to void (show recent envelopes).

### 2. Confirm Action
- Ask: "Are you sure you want to void this envelope? This cannot be undone. Signers will be notified."

### 3. Void the Envelope
Make the following API call:

```
POST /api/envelopes/{envelopeId}/void
{
  "reason": "User-provided reason (optional)"
}
```

### 4. Confirm to the User
- Display: "✓ Envelope voided. Signers have been notified."

## Error Handling
- If the envelope is already voided, inform the user.
- If the envelope is already completed, ask if they really want to void a completed document (unusual).

## Examples

**User:** "/coseal:void env_abc123"

**Claude:**
1. Asks: "Are you sure you want to void the NDA envelope? This will cancel the signing process."
2. User confirms.
3. Voids envelope via API.
4. Responds: "✓ Envelope voided. Alice and Bob have been notified that this signing is canceled."
