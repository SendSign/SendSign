# Retention Compliance Skill

## Purpose

Teach Claude about document retention requirements across industries and help users choose appropriate retention policies.

## Key Concepts

### Legal Retention Requirements

**Healthcare (HIPAA):**
- Medical records: 6-10 years (varies by state)
- Medicare/Medicaid: 10 years
- Minor patients: Until age 21 + 6 years
- CoSeal preset: 7 years (conservative)

**Financial Services:**
- SEC Rule 17a-4: 6 years for broker-dealer records
- FINRA: 6 years for customer records
- Bank records: 5-7 years
- CoSeal preset: 7 years

**Tax Records (IRS):**
- General: 3-7 years
- Employment tax: 4 years
- Property records: 7 years
- Fraud cases: Indefinite
- CoSeal preset: 7 years (covers most cases)

**Employment:**
- EEOC: 1 year (job applications)
- FLSA: 3 years (payroll records)
- OSHA: 5 years (injury logs)
- Personnel files: 5-7 years after termination
- CoSeal preset: 5 years

**GDPR (Europe):**
- Data minimization principle: no longer than necessary
- Right to erasure: delete upon request (with exceptions)
- Typical: 1-2 years unless legal basis for longer
- CoSeal preset: 1 year with auto-delete

### Retention vs. Destruction

**Retention means:**
- Keep documents accessible for the required period
- Maintain integrity and authenticity
- Provide upon request (legal discovery, audit)

**Destruction means:**
- Securely delete after retention period expires
- Irreversible deletion (not just soft delete)
- Log deletion for audit trail

### Auto-Delete vs. Flagged Review

**Auto-delete (true):**
- Document is automatically deleted when retention expires
- Use for: GDPR compliance, routine documents
- Risk: No human review before deletion

**Flagged review (false):**
- Document is flagged for manual review when expired
- Admin decides whether to delete or extend
- Use for: High-value documents, regulated industries
- CoSeal default: Flagged review for safety

### Industry-Specific Guidance

**Healthcare:**
- Use the Healthcare (HIPAA) preset
- Never auto-delete medical records
- Consider state-specific requirements (some require 10 years)
- Patient consent forms: Lifetime retention recommended

**Financial:**
- Use Financial Services preset
- SEC-regulated firms: 6 years minimum
- Tax-related: 7 years to align with IRS
- Contracts with ongoing obligations: Retain until terminated + 7 years

**Tech/SaaS:**
- Use General Business preset (3 years)
- GDPR applies if EU customers: Use GDPR Minimal for personal data
- Customer contracts: Retain until terminated + statute of limitations

**HR/Employment:**
- Use Employment Records preset
- I-9 forms: 3 years after hire or 1 year after termination (whichever is longer)
- Discrimination complaints: Keep until resolved + 1 year

## When to Suggest Retention Policies

**During envelope creation:**
If the user is sending a document, proactively suggest a retention policy based on:
- Document type (NDA, employment contract, medical form, etc.)
- User's industry (if known)
- Regulations mentioned (HIPAA, GDPR, SEC, etc.)

**Example:**
> "I notice this is an employment contract. I recommend the **Employment Records** retention policy (5 years). This aligns with FLSA and EEOC requirements. Would you like me to assign this policy?"

**When reviewing documents:**
If a document lacks a retention policy, suggest one:
> "This NDA doesn't have a retention policy assigned. For general business NDAs, I recommend a **3-year** retention. If this is a healthcare or financial NDA, you may need **7 years**. Which applies?"

**When documents are expiring:**
If documents are approaching expiration, remind the user:
> "You have 3 documents expiring in the next 30 days. Would you like to review them before they're flagged for deletion?"

## Balancing Competing Requirements

**GDPR vs. Legal Retention:**
- GDPR requires data minimization
- Industry regulations require retention
- Solution: Use the **minimum** retention required by law, no longer

**Example:**
A healthcare company with EU patients:
- HIPAA: 7 years
- GDPR: Minimize
- Recommendation: 7 years for medical records (legal requirement), 1 year for non-medical documents (GDPR)

**Storage Costs vs. Legal Risk:**
- Longer retention = higher storage costs
- Premature deletion = legal risk
- Recommendation: Follow industry standards, use auto-delete for routine documents only

## Common Mistakes to Avoid

❌ **Deleting too early:** Violates retention laws, destroys evidence
❌ **Keeping forever:** GDPR violations, unnecessary storage costs
❌ **One size fits all:** Different document types need different policies
❌ **Auto-delete everything:** High risk, no human oversight
❌ **Ignoring state laws:** Some states have longer requirements than federal

## Red Flags

**User wants to delete immediately:**
- Explain retention requirements
- Suggest shortest compliant policy
- Warn about legal discovery obligations

**User wants to keep forever:**
- Explain GDPR right to erasure
- Suggest maximum reasonable retention
- Offer flagged review instead of indefinite retention

**User is unsure of industry:**
- Ask clarifying questions about their business
- Default to General Business (3 years)
- Recommend consulting legal counsel for certainty

## Proactive Assistance

Claude should:
- Suggest retention policies during envelope creation
- Remind users of expiring documents
- Explain the "why" behind retention periods
- Help users create custom policies for unique needs
- Flag inconsistencies (e.g., 1-year retention for SEC-regulated docs)
