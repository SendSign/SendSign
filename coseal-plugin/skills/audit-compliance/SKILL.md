# Audit & Compliance Skill

## Purpose
Teach Claude about ESIGN Act, UETA, eIDAS requirements, what makes a signature legally valid, and how to explain compliance to users.

## Legal Frameworks

### 1. ESIGN Act (US Federal)

The **Electronic Signatures in Global and National Commerce Act** (2000) establishes that electronic signatures are legally valid and enforceable in the United States.

**Requirements for a valid e-signature under ESIGN:**

1. ✅ **Intent to sign**: The signer must intend to sign the document (not accidental)
2. ✅ **Consent to do business electronically**: The signer must consent to use electronic signatures
3. ✅ **Association**: The signature must be associated with the document being signed
4. ✅ **Record retention**: A complete and accurate record must be retained

**How CoSeal meets ESIGN requirements:**

- **Intent**: The signing ceremony requires explicit action (click "Sign", draw signature, or type name)
- **Consent**: Signers receive clear notification that they're signing electronically
- **Association**: Signatures are cryptographically bound to the document via PDF sealing
- **Record retention**: Immutable audit trail captures all events; sealed PDF and Certificate of Completion are permanent records

### 2. UETA (US State-Level)

The **Uniform Electronic Transactions Act** has been adopted by 47 US states (similar to ESIGN).

**Requirements:**

1. ✅ Record must be retained and accurately reproduced
2. ✅ Signature must be attributable to a person
3. ✅ Intent to sign must be demonstrated

**How CoSeal meets UETA requirements:**

- **Retention**: Documents stored encrypted, audit trail is immutable
- **Attribution**: Each signature is linked to a unique signer identity (email, phone, or government ID)
- **Intent**: Explicit signing action required

### 3. eIDAS (EU Regulation)

**eIDAS** (electronic IDentification, Authentication and trust Services) is the EU regulation for electronic signatures.

**Three signature levels:**

#### Simple Electronic Signature (SES)
- **Definition**: Data in electronic form attached to or logically associated with other data
- **Legal status**: Admissible as evidence, but not presumed reliable
- **CoSeal support**: ✅ Full support (default mode)
- **Use cases**: Low-risk agreements, internal approvals, non-regulated documents

#### Advanced Electronic Signature (AES)
- **Definition**: Uniquely linked to signer, capable of identifying signer, created using data under signer's sole control, linked to data so any change is detectable
- **Legal status**: Presumed reliable, equivalent to handwritten signatures in most cases
- **CoSeal support**: ✅ Full support (with identity verification enabled)
- **Use cases**: Business contracts, vendor agreements, HR documents

**CoSeal AES features:**
- Cryptographic sealing ensures any document change is detectable
- Identity verification (email + SMS OTP, or government ID check) ensures unique linkage to signer
- Private signing tokens ensure signer's sole control

#### Qualified Electronic Signature (QES)
- **Definition**: AES + created by a qualified signature creation device + based on a qualified certificate from a trust service provider
- **Legal status**: Equivalent to handwritten signatures in all EU member states
- **CoSeal support**: 🚧 Roadmap (via integration with Swisscom AIS, Namirial, or other qualified TSPs)
- **Use cases**: Regulated industries (finance, healthcare, government), high-value contracts

### 4. Other Jurisdictions

**Canada**: PIPEDA allows electronic signatures for most documents
**UK**: Post-Brexit, follows eIDAS principles
**Australia**: Electronic Transactions Act 1999
**Global**: Most jurisdictions accept electronic signatures under their own regulations

**Claude's guidance:**
- For US users: "CoSeal signatures comply with the ESIGN Act and UETA."
- For EU users: "CoSeal provides Simple and Advanced Electronic Signatures under eIDAS. For Qualified signatures, we can integrate with a trust service provider."
- For other jurisdictions: "CoSeal signatures are legally valid in most countries. Consult your legal counsel for specific requirements."

## What Makes a Signature Valid?

A legally valid electronic signature requires:

1. ✅ **Intent**: The signer must intend to sign
2. ✅ **Attribution**: The signature must be attributable to a specific person
3. ✅ **Integrity**: The document must be protected from alteration after signing
4. ✅ **Non-repudiation**: The signer cannot later deny signing (proven by audit trail)

**CoSeal's implementation:**

| Requirement       | CoSeal Implementation                                                                 |
|-------------------|---------------------------------------------------------------------------------------|
| Intent            | Explicit "Sign" button, signature pad interaction, checkbox confirmation              |
| Attribution       | Email-based tokens, optional SMS/phone/ID verification                                |
| Integrity         | Cryptographic sealing (SHA-256 hash + PKCS#7 signature embedded in PDF)              |
| Non-repudiation   | Immutable audit trail with IP address, timestamp, signer actions, verification proof |

## Audit Trail as Evidence

The **audit trail** is the legal evidence that signing occurred and was valid.

**CoSeal's audit trail captures:**

- `envelope_created`: Who created the envelope, when, from what IP
- `envelope_sent`: When the envelope was sent to signers
- `signer_viewed`: When each signer opened the document (timestamp, IP address)
- `signer_identity_verified`: If identity verification was performed (method, timestamp)
- `signer_signed`: When each signer completed signing (timestamp, IP address)
- `document_sealed`: When the document was cryptographically sealed (certificate fingerprint, hash)
- `completion_cert_generated`: When the Certificate of Completion was created

**Why this matters:**

In legal disputes, the audit trail proves:
- The document was sent to the correct recipient
- The recipient opened and viewed the document (intent to engage)
- The recipient took explicit action to sign (intent to sign)
- No one else could have signed on their behalf (attribution via email/phone)
- The document was not altered after signing (cryptographic seal)

**Claude should explain:**
"The audit trail is a complete, tamper-proof record of every action related to this document. If this signature is ever questioned in court, the audit trail provides evidence that the signing was legitimate."

## Certificate of Completion

The **Certificate of Completion** is a separate PDF that contains:

- Document title and envelope ID
- List of all signers (name, email, signed date, IP address)
- Full audit trail (all events with timestamps)
- Cryptographic fingerprint (SHA-256 hash of sealed document)

**Purpose:**
- Independent verification of signing without needing CoSeal running
- Attachment for legal records, filings, or regulatory submissions
- Human-readable summary of the signing ceremony

**Claude should suggest:**
"I'll also generate a Certificate of Completion that you can attach to your legal records. It's a standalone PDF that proves the document was signed."

## When to Use Identity Verification

Claude should recommend identity verification based on document sensitivity:

| Document Type                          | Recommended Verification Level |
|----------------------------------------|--------------------------------|
| Internal approvals, low-risk documents | None (email only)              |
| NDAs, vendor agreements                | Low (email + SMS OTP)          |
| Employment agreements, client contracts | Medium (email + phone)         |
| Financial agreements, loan documents   | High (government ID check)     |
| Regulated industries (GDPR, HIPAA, SOX)| High + audit trail review      |

**Phrasing:**
- "For this NDA, email verification should be sufficient. Would you like to add SMS verification for extra security?"
- "This is a financial contract, so I recommend using government ID verification to ensure the signer is who they claim to be."

## Disclaimer

Claude should always include this disclaimer when discussing legal compliance:

"CoSeal is designed to help you comply with electronic signature laws, but I'm not a lawyer. For specific legal advice about your use case, please consult your legal counsel."

## Example: Explaining Compliance to a User

**User:** "Are these signatures legally binding?"

**Claude:**
"Yes, CoSeal signatures are legally binding under the ESIGN Act (US) and equivalent regulations in most countries. Here's why:

1. **Intent**: Each signer explicitly clicks 'Sign' and takes an action to create their signature.
2. **Attribution**: Signatures are linked to the signer's verified email (and optionally phone or government ID).
3. **Integrity**: The document is cryptographically sealed after signing, so any tampering is detectable.
4. **Audit trail**: Every action is recorded with timestamps and IP addresses, providing evidence that the signing was legitimate.

You'll receive a Certificate of Completion that includes the full audit trail—this serves as proof of signing for legal records.

CoSeal is designed to help you comply with electronic signature laws, but for specific legal advice, please consult your legal counsel."
