# SendSign Legal Compliance Guide

This document explains how SendSign helps you comply with electronic signature laws and regulations worldwide.

**Disclaimer:** SendSign is designed to assist with compliance, but this guide is not legal advice. For specific legal guidance about your use case, consult with qualified legal counsel in your jurisdiction.

---

## Electronic Signature Laws

### United States

#### ESIGN Act (2000)

The **Electronic Signatures in Global and National Commerce Act** is a federal law that grants electronic signatures the same legal status as handwritten signatures for interstate and foreign commerce.

**Requirements for valid e-signatures under ESIGN:**

1. ✅ **Intent to sign**: The signer must intend to sign electronically
2. ✅ **Consent to do business electronically**: The signer must agree to use electronic records
3. ✅ **Association with the record**: The signature must be logically associated with the document
4. ✅ **Record retention**: An accurate and accessible record must be retained

**How SendSign complies:**

| Requirement         | SendSign Implementation                                                                                      |
|---------------------|-----------------------------------------------------------------------------------------------------------|
| Intent to sign      | Signers must explicitly click "Sign" button, draw/type signature, and confirm action                      |
| Consent             | Signing ceremony includes clear disclosure that this is an electronic signature                            |
| Association         | Signatures are cryptographically embedded in the PDF and linked to signer identity                        |
| Record retention    | Immutable audit trail + sealed PDF + Certificate of Completion provide permanent, tamper-proof records    |

**Reference:** [15 U.S.C. §§ 7001–7006](https://www.govinfo.gov/content/pkg/PLAW-106publ229/html/PLAW-106publ229.htm)

#### UETA (Uniform Electronic Transactions Act)

UETA has been adopted by 47 US states (all except Illinois, New York, Washington). It provides similar requirements to ESIGN at the state level.

**Key requirements:**

1. ✅ A record must be retained in a form capable of accurate reproduction
2. ✅ A signature must be attributable to a person
3. ✅ Intent to sign must be demonstrated

**How SendSign complies:**

- **Retention**: Documents stored encrypted, audit trail is immutable and exportable
- **Attribution**: Each signature is linked to verified email, phone (optional), or government ID (optional)
- **Intent**: Explicit signing actions required (draw signature, type name, check confirmation box)

**Reference:** [Uniform Law Commission](https://www.uniformlaws.org/committees/community-home?CommunityKey=2c04b76c-2b7d-4399-977e-d5876ba7e034)

---

### European Union

#### eIDAS Regulation (2014)

**eIDAS** (electronic IDentification, Authentication and trust Services) is the EU regulation governing electronic signatures, electronic seals, time stamps, and other trust services.

**Three types of electronic signatures:**

##### 1. Simple Electronic Signature (SES)

**Definition:** Data in electronic form attached to or logically associated with other data which is used by the signatory to sign.

**Legal effect:** Admissible as evidence in legal proceedings, but not presumed to be reliable.

**SendSign support:** ✅ **Fully supported** (default mode)

**Use cases:**
- Internal approvals
- Low-risk agreements
- Documents where legal disputes are unlikely

**How to use:** Send envelope with default settings (no identity verification required).

---

##### 2. Advanced Electronic Signature (AES)

**Definition:** A signature that meets these requirements:
- Uniquely linked to the signatory
- Capable of identifying the signatory
- Created using electronic signature creation data under the signatory's sole control
- Linked to the data signed in such a way that any subsequent change is detectable

**Legal effect:** Presumed reliable; carries significant legal weight.

**SendSign support:** ✅ **Fully supported** (with identity verification enabled)

**Requirements and SendSign implementation:**

| Requirement                      | SendSign Implementation                                                                                  |
|----------------------------------|-------------------------------------------------------------------------------------------------------|
| Uniquely linked to signatory     | Each signature is created with a unique single-use signing token                                       |
| Capable of identifying signatory | Identity verification via email + SMS OTP, or government ID check                                      |
| Sole control                     | Signing tokens expire after use; only the verified recipient can access the signing ceremony           |
| Detectable changes               | SHA-256 cryptographic hash + PKCS#7 signature ensures any tampering is detectable                      |

**Use cases:**
- Business contracts
- Vendor agreements
- HR documents (employment contracts, confidentiality agreements)
- Financial agreements (loans, credit agreements)

**How to use:**
```json
{
  "signers": [
    {
      "name": "Alice",
      "email": "alice@example.com",
      "verificationLevel": "medium"
    }
  ]
}
```

**Verification levels:**
- `low`: Email + SMS OTP
- `medium`: Email + SMS + phone verification
- `high`: Government ID check (passport, driver's license, national ID)

---

##### 3. Qualified Electronic Signature (QES)

**Definition:** An AES that is:
- Created by a qualified signature creation device (QSCD)
- Based on a qualified certificate for electronic signatures issued by a qualified trust service provider (QTSP)

**Legal effect:** Equivalent to a handwritten signature in all EU member states. Cannot be denied legal effect solely on the grounds that it is electronic.

**SendSign support:** ✅ **Supported** (via Trust Service Provider integration)

**Supported TSPs:**

| Provider       | Region           | Documentation                                        |
|----------------|------------------|------------------------------------------------------|
| Swisscom AIS   | Switzerland / EU | [Swisscom AIS Docs](https://www.swisscom.ch/en/business/enterprise/offer/security/all-in-signing-service.html) |
| Namirial       | Italy / EU       | [Namirial Docs](https://www.namirial.com/en/digital-trust/signing-solutions/) |

**Use cases:**
- Regulated industries (banking, insurance, healthcare)
- Government contracts
- Real estate transactions
- High-value agreements (> EUR 1M)
- Documents requiring notarization equivalent

**Configuration:**
```json
{
  "signers": [
    {
      "name": "Alice",
      "email": "alice@example.com",
      "verificationLevel": "qualified",
      "qtspProvider": "swisscom"
    }
  ]
}
```

**Environment variables:**
```env
QES_PROVIDER=swisscom
SWISSCOM_AIS_URL=https://ais.swisscom.com/AIS-Server/rs/v1.0
SWISSCOM_AIS_KEY=your-key
SWISSCOM_AIS_CERT_PATH=/certs/swisscom-client.pem
```

**Pricing:** TSPs charge EUR 0.50-2.00 per QES. Contact the TSP for volume pricing.

**Onboarding:**
1. Create an account on the TSP's developer portal
2. Obtain API credentials (key/cert)
3. Set `QES_PROVIDER` and TSP-specific environment variables
4. Test with the TSP's sandbox environment
5. Go live

---

### Other Jurisdictions

#### United Kingdom

Post-Brexit, the UK follows **eIDAS-equivalent principles** under the **Electronic Communications Act 2000** and **Electronic Signatures Regulations 2002**.

**SendSign compliance:** Same as eIDAS (SES and AES supported).

#### Canada

**PIPEDA** (Personal Information Protection and Electronic Documents Act) and provincial laws (e.g., Ontario's Electronic Commerce Act) allow electronic signatures.

**Requirements:**
- Consent to use electronic signatures
- Reliable method of identifying the signatory
- Record retention

**SendSign compliance:** Meets all requirements.

#### Australia

**Electronic Transactions Act 1999** recognizes electronic signatures as legally valid.

**Requirements:**
- Method used identifies the person and indicates their intention
- Method is reliable
- Consent to use electronic signatures

**SendSign compliance:** Meets all requirements.

#### Global

Most countries recognize electronic signatures under their own laws. SendSign's cryptographic sealing, audit trail, and identity verification features are designed to meet the highest common requirements across jurisdictions.

---

## Audit Trail as Legal Evidence

The **audit trail** is the most critical component for proving the validity of an electronic signature in legal proceedings.

### What SendSign's Audit Trail Captures

Every action related to an envelope is logged with:

| Event                          | Data Captured                                                                                     |
|--------------------------------|---------------------------------------------------------------------------------------------------|
| `envelope_created`             | User ID, IP address, timestamp, document hash                                                     |
| `envelope_sent`                | Timestamp, list of recipients                                                                     |
| `signer_viewed`                | Signer ID, IP address, timestamp, user agent (browser/device)                                     |
| `signer_identity_verified`     | Verification method (email, SMS, government ID), timestamp, verification provider reference       |
| `signer_signed`                | Signer ID, IP address, timestamp, signature image hash, device info                               |
| `signer_declined`              | Signer ID, IP address, timestamp, reason (if provided)                                            |
| `document_sealed`              | SHA-256 document hash, certificate fingerprint, timestamp                                         |
| `completion_cert_generated`    | Timestamp, certificate PDF hash                                                                   |

### Audit Trail Immutability

- Audit events are **append-only** — once written, they cannot be modified or deleted
- Each event is timestamped with millisecond precision
- Events are stored in the database with referential integrity to the envelope
- Audit trail is included in the Certificate of Completion (PDF) and can be exported as JSON

### Legal Admissibility

In legal disputes, the audit trail can prove:

1. **The document was delivered** to the correct recipient (email, IP address)
2. **The recipient accessed the document** (viewed event, timestamp, IP)
3. **Identity verification occurred** (OTP codes, government ID check)
4. **The recipient intended to sign** (explicit "Sign" action, not accidental)
5. **The signature is authentic** (cryptographic hash, certificate chain)
6. **No tampering occurred** (SHA-256 hash verification)

**Court precedent:** US courts have consistently upheld electronic signatures with strong audit trails as equivalent to handwritten signatures. Notable cases include:
- *Cloud Corp. v. Hasbro, Inc.* (1st Cir. 2002)
- *Mehta v. U.S.* (E.D.N.Y. 2009)

---

## Certificate of Completion

The **Certificate of Completion** is a standalone PDF that serves as independent proof of signing.

### Contents

1. **Envelope details**: Title, creation date, completion date
2. **Signer information**: Name, email, signed date, IP address, verification method
3. **Document fingerprint**: SHA-256 hash of the sealed document
4. **Full audit trail**: All events with timestamps
5. **Signing certificate info**: Issuer, serial number, fingerprint

### Uses

- Attach to legal records or regulatory filings
- Provide to auditors or compliance officers
- Store in document management systems
- Present as evidence in legal proceedings
- Share with third parties who need proof of signing

### Verification

Anyone can verify the sealed document matches the certificate:

```bash
# Compute SHA-256 hash of sealed PDF
sha256sum signed-document.pdf

# Compare to hash in Certificate of Completion
# If they match, the document is authentic and unaltered
```

---

## Industry-Specific Compliance

### Healthcare (HIPAA, USA)

**Requirements:**
- Access controls
- Audit logs
- Encryption at rest and in transit
- Patient consent

**SendSign compliance:**
- ✅ API key authentication + token-based signing access
- ✅ Comprehensive audit trail
- ✅ AES-256-GCM encryption for documents, TLS for transit (with reverse proxy)
- ✅ Explicit consent captured in signing ceremony

**Recommendation:** Use identity verification level `high` for patient consent forms.

### Financial Services (SOX, GLBA, USA)

**Requirements:**
- Strong authentication
- Audit trails
- Data integrity
- Non-repudiation

**SendSign compliance:**
- ✅ Multi-factor identity verification (email + SMS + government ID)
- ✅ Immutable audit trail with all actions logged
- ✅ Cryptographic sealing ensures data integrity
- ✅ Audit trail provides non-repudiation evidence

**Recommendation:** Use identity verification level `high` and retain audit trails for at least 7 years.

### Real Estate (ESIGN, UETA, USA)

**Requirements:**
- Proof of identity
- Intent to sign
- Secure document storage
- Compliance with state-specific laws

**SendSign compliance:**
- ✅ Identity verification via government ID check (optional)
- ✅ Explicit signing actions demonstrate intent
- ✅ Encrypted storage with configurable retention
- ✅ Audit trail meets state-specific requirements

**Recommendation:** For high-value transactions, use identity verification level `high` (government ID).

### GDPR (EU)

**Requirements:**
- Data minimization
- Purpose limitation
- Right to erasure
- Data portability
- Security

**SendSign compliance:**
- ✅ Only collects necessary data (name, email, signature)
- ✅ Signatures used only for intended purpose
- ✅ Voided envelopes can be purged (configurable retention)
- ✅ Audit trail exportable as JSON for data portability
- ✅ Encryption at rest and in transit

**Recommendation:** Configure `DOCUMENT_RETENTION_DAYS` to match your GDPR data retention policy.

---

## Record Retention

SendSign allows configurable document retention policies.

**Environment variable:**
```env
DOCUMENT_RETENTION_DAYS=2555  # 7 years (default)
```

**Industry guidelines:**
- **General business contracts**: 3-7 years
- **Financial records**: 7 years (USA: SOX, IRS)
- **Healthcare records**: 7 years (USA: HIPAA)
- **Employment records**: 7 years
- **Tax records**: 7 years
- **Real estate**: 10+ years

**How it works:**
- Documents older than the retention period are automatically flagged for deletion
- A cron job checks daily for expired documents
- Expired documents are purged from S3 and the database

**Manual override:**
```bash
# Disable auto-purge
export DOCUMENT_RETENTION_DAYS=0
```

---

## Best Practices for Compliance

1. **Use appropriate identity verification** based on document sensitivity
2. **Retain audit trails** for the required period (7 years for most industries)
3. **Export audit trails regularly** for backup and compliance reporting
4. **Enable TLS** for all communications (use a reverse proxy or load balancer)
5. **Rotate API keys** at least every 90 days
6. **Monitor audit logs** for unusual activity
7. **Backup encryption keys** securely (losing the key means losing document access)
8. **Consult legal counsel** for industry-specific requirements
9. **Provide signers with a copy** of the signed document and certificate
10. **Test your signing workflow** before using in production

---

## Compliance Checklist

Before going live, verify:

- [ ] TLS is enabled (HTTPS)
- [ ] Environment variables are set correctly (encryption key, database URL, S3)
- [ ] Identity verification is configured (Twilio for SMS, Jumio/Onfido for government ID)
- [ ] Email delivery is working (SendGrid or SMTP)
- [ ] Audit trail is being captured (check after creating a test envelope)
- [ ] Certificate of Completion is generated correctly
- [ ] Sealed PDFs open and display signatures
- [ ] Document retention policy is configured
- [ ] Backups are enabled (database + S3)
- [ ] API keys are stored securely (not in source code)
- [ ] Legal counsel has reviewed your use case

---

## Resources

### Legal References

- **ESIGN Act**: [15 U.S.C. §§ 7001–7006](https://www.govinfo.gov/content/pkg/PLAW-106publ229/html/PLAW-106publ229.htm)
- **UETA**: [Uniform Law Commission](https://www.uniformlaws.org/committees/community-home?CommunityKey=2c04b76c-2b7d-4399-977e-d5876ba7e034)
- **eIDAS Regulation**: [EU Regulation 910/2014](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32014R0910)
- **UK Electronic Signatures Regulations**: [SI 2002/318](https://www.legislation.gov.uk/uksi/2002/318/contents/made)

### Industry Standards

- **NIST Cybersecurity Framework**: [https://www.nist.gov/cyberframework](https://www.nist.gov/cyberframework)
- **ISO 27001**: Information security management
- **SOC 2**: Service organization controls for security and privacy

### Further Reading

- **ABA Electronic Signature Guide**: [American Bar Association](https://www.americanbar.org/)
- **ETSI Standards for e-signatures**: [European Telecommunications Standards Institute](https://www.etsi.org/)

---

## Disclaimer

This guide provides general information about electronic signature laws and how SendSign helps meet compliance requirements. It is not legal advice. Laws vary by jurisdiction, industry, and use case. Always consult qualified legal counsel to ensure your specific use of SendSign complies with applicable regulations.

SendSign contributors and maintainers are not liable for any legal issues arising from the use of this software.

---

## Document Retention Policies

SendSign includes built-in retention policies for industry-specific compliance requirements.

### Built-in Retention Presets

| Policy | Retention Period | Industry | Auto-Delete | Regulation |
|--------|------------------|----------|-------------|------------|
| **Healthcare (HIPAA)** | 7 years | Healthcare | No | HIPAA, state laws |
| **Financial Services** | 7 years | Finance | No | SEC Rule 17a-4, FINRA |
| **Tax Records** | 7 years | All | No | IRS guidelines |
| **Employment Records** | 5 years | HR | No | FLSA, EEOC |
| **General Business** | 3 years | All | No | Statute of limitations |
| **GDPR Minimal** | 1 year | EU/GDPR | Yes | GDPR data minimization |

### Legal Retention Requirements by Industry

#### Healthcare (HIPAA)
- Medical records: 6-10 years (varies by state)
- Medicare/Medicaid: 10 years
- Minors: Until age 21 + 6 years
- **SendSign preset:** 7 years, manual review

#### Financial Services (SEC/FINRA)
- SEC Rule 17a-4: 6 years for broker-dealer records
- Customer account records: 6 years
- Contracts: Duration + statute of limitations
- **SendSign preset:** 7 years, manual review

#### Tax Records (IRS)
- General records: 3-7 years
- Fraud cases: Indefinite
- Employment tax: 4 years
- **SendSign preset:** 7 years (conservative approach)

#### Employment (EEOC/FLSA)
- Payroll records: 3 years (FLSA)
- Personnel files: 5-7 years after termination
- I-9 forms: 3 years after hire OR 1 year after termination
- **SendSign preset:** 5 years

#### GDPR (EU)
- Data minimization principle: keep only as long as necessary
- Right to erasure: delete upon request (with legal exceptions)
- Storage limitation: define retention periods upfront
- **SendSign preset:** 1 year with auto-delete

### Configuring Retention

**Create custom policy:**
\`\`\`bash
POST /api/retention/policies
{
  "name": "California Medical Records",
  "retentionDays": 2555,
  "autoDelete": false,
  "notifyBefore": 90
}
\`\`\`

**Assign to envelope:**
\`\`\`bash
POST /api/envelopes/{id}/retention
{"policyId": "uuid-of-policy"}
\`\`\`

**View expiring documents:**
\`\`\`bash
GET /api/retention/expiring?days=30
\`\`\`

**Generate compliance report:**
\`\`\`bash
GET /api/retention/report
\`\`\`

### Retention Cron Job

SendSign runs a daily retention check at 2 AM (server time):
- Check for expired documents
- Auto-delete if \`autoDelete: true\`
- Flag for manual review if \`autoDelete: false\`
- Send expiry warnings

**Manual trigger:**
\`\`\`bash
POST /api/retention/process
\`\`\`

### Best Practices

✅ **Do:**
- Assign retention policies at envelope creation
- Use presets for standard compliance
- Review expiring documents before deletion
- Generate retention reports for audits

❌ **Don't:**
- Delete documents prematurely (legal risk)
- Keep documents indefinitely (GDPR violation, storage cost)
- Use auto-delete for high-value documents without review
- Ignore state-specific requirements

### Legal Considerations

⚠️ **Disclaimer:** SendSign's retention presets are guidelines based on common regulations. Your specific retention requirements may vary based on state/local laws, industry regulations, and contractual obligations. Always consult legal counsel for compliance guidance.
