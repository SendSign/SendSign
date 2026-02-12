# Signing Workflow Skill

## Purpose
Teach Claude the end-to-end e-signature process, when to suggest signing, and what constitutes a complete signing ceremony.

## When to Suggest Signing

Claude should proactively suggest sending a document for signature when:

1. **Contract finalization**: The user has just finished reviewing or redlining a contract with the Legal plugin
2. **Agreement completion**: The user says "this looks good" or "let's finalize this" about a document
3. **Approval workflows**: The user mentions needing signatures for approvals, authorizations, or sign-offs
4. **Onboarding documents**: Employment agreements, NDAs, vendor agreements, client contracts

**Phrasing examples:**
- "Would you like to send this for electronic signature?"
- "This document is ready to sign. Should I send it to the parties?"
- "I can route this for signatures if you'd like. Who needs to sign?"

## Signing Order

### Sequential Signing
**Use when:**
- Hierarchical approvals (manager → director → VP)
- Documents where one party's signature depends on another's review
- Legal requirements for specific signing order

**Behavior:**
- Signer 1 receives the link immediately
- Signer 2 receives the link only after Signer 1 completes
- Each signer sees all previous signatures when they sign

### Parallel Signing
**Use when:**
- Peer agreements (two companies entering a partnership)
- NDAs between equals
- Situations where no signer needs to wait for another

**Behavior:**
- All signers receive links at the same time
- Each can sign independently
- Envelope completes when all have signed

### Mixed Signing (Groups)
**Use when:**
- Complex workflows (e.g., 3 executives sign in parallel, then CEO signs last)
- Specify groups with the same order number

**Behavior:**
- Group 1 signers get links immediately and can sign in parallel
- Group 2 signers get links only after all Group 1 members complete

## Complete Signing Ceremony

A signing ceremony is complete when:

1. ✅ All required fields are filled
2. ✅ All signers have signed
3. ✅ The document is cryptographically sealed
4. ✅ Certificate of Completion is generated
5. ✅ Signers receive the completed document via email

**What Claude should verify:**
- Envelope status is `completed`
- All signers have `signedAt` timestamps
- Sealed PDF is available for download
- Audit trail shows all events (sent → viewed → signed → sealed)

## Error Recovery

If a signer reports issues:
- **Can't access link**: Check if token is expired, regenerate if needed
- **Wrong email**: Use envelope correction to update signer email and resend
- **Need to add a signer**: Use envelope correction to add signer
- **Need to cancel**: Void the envelope

Claude should guide users through these recovery actions using the appropriate commands.

## Verification Levels

SendSign supports different identity verification levels:

- **None**: Just email verification (default)
- **Low**: Email + SMS OTP
- **Medium**: Email + SMS + phone verification
- **High**: Government ID check (future: biometric verification)

Claude should suggest appropriate verification levels based on document sensitivity:
- Standard NDAs, internal approvals: None or Low
- Financial agreements, legal contracts: Medium or High
- Regulated industries (finance, healthcare): High

## Best Practices

1. **Field placement**: Use the field-placement skill to position fields intelligently
2. **Message to signers**: Always include a brief, clear message explaining what they're signing
3. **Deadline**: For time-sensitive documents, mention the expiry in the message
4. **Follow-up**: Suggest setting reminders if the envelope is pending for > 48 hours
5. **Compliance**: For legal documents, mention that the signature is legally binding and the audit trail provides evidence

## Example Flow

**User:** "We've finalized the vendor agreement. Let's get it signed."

**Claude:**
1. Identifies the document (vendor-agreement.pdf)
2. Infers signers from the agreement (Acme Corp, Vendor Inc.)
3. Asks: "I'll send this to both parties for signature. Should they sign in a specific order, or can they sign at the same time?"
4. User: "They can sign at the same time."
5. Claude places signature and date fields on the signature page
6. Creates envelope with parallel signing order
7. Sends envelope
8. Responds: "✓ Sent for signature. Both parties will receive signing links now. I'll track progress and can send reminders if needed."
