---
name: send-for-signature
description: Send a document for electronic signature
---

# Send for Signature

Send a document to one or more people for legally-binding electronic signature.

## Usage examples
- "Send this NDA to jane@acme.com for signature"
- "Get this MSA signed by bob@partner.com and alice@partner.com"
- "Send the reviewed contract to both parties for signing"

## What happens
1. Document is uploaded to SendSign
2. Envelope is created with the specified signers
3. If a matching template exists, signature fields are placed automatically
4. If no template, you'll get a link to place fields manually (takes 30 seconds)
5. Each signer receives an email with a secure signing link
6. You're notified when signing is complete

## Combining with Legal plugin
If you've just reviewed a contract with the Legal plugin:
- "Send this reviewed contract to sarah@acme.com for signature"
- The reviewed document is sent directly — no re-upload needed
