# /sendsign:download — Download Signed Document

## Description
Download the cryptographically sealed, signed PDF and the Certificate of Completion.

## What Claude Should Do

### 1. Get Envelope ID
- If the user provides an envelope ID, use that.
- If not, fetch the most recent completed envelope.

### 2. Verify Envelope is Completed
- If the envelope is not completed, inform the user it's not ready yet.

### 3. Download Files
Make the following API calls:

```
GET /api/envelopes/{envelopeId}/download
```

This returns the sealed PDF.

```
GET /api/envelopes/{envelopeId}/certificate
```

This returns the Certificate of Completion PDF.

### 4. Save to Workspace
- Save the sealed PDF as `{original-filename}-signed.pdf`
- Save the certificate as `{original-filename}-certificate.pdf`
- Report the SHA-256 fingerprint of the sealed document for verification.

### 5. Confirm to the User
- Display:
  ```
  ✓ Downloaded signed document: nda-signed.pdf
  ✓ Downloaded certificate: nda-certificate.pdf
  SHA-256: abc123def456...
  
  The sealed PDF contains cryptographic signatures and can be independently verified.
  ```

## Error Handling
- If the envelope is not completed, inform the user.
- If download fails, display the error.

## Examples

**User:** "/sendsign:download env_abc123"

**Claude:**
1. Fetches envelope `env_abc123`
2. Verifies status is `completed`
3. Downloads sealed PDF and certificate
4. Saves to workspace: `nda-signed.pdf`, `nda-certificate.pdf`
5. Responds with confirmation and SHA-256 hash
