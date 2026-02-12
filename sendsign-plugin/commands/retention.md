# `/sendsign:retention` Command

**Purpose:** Manage document retention policies and check retention status.

## What This Command Does

When the user invokes `/sendsign:retention` (with any variant like "check retention", "view expiring documents", "assign retention policy", etc.), Claude should:

1. **Determine the user's intent:**
   - View expiring documents
   - Assign a retention policy to an envelope
   - View available retention policies (including presets)
   - Check retention status for a specific envelope
   - Generate a retention report

2. **Execute the appropriate action:**

   **View Expiring Documents:**
   ```
   GET /api/retention/expiring?days=30
   ```
   Show documents that will expire within N days (default 30).

   **Assign Retention Policy:**
   ```
   POST /api/envelopes/{envelopeId}/retention
   {
     "policyId": "uuid"
   }
   ```
   Assign a specific retention policy to an envelope.

   **View Available Policies:**
   ```
   GET /api/retention/policies
   ```
   Show all available policies including industry presets (healthcare, financial, tax, employment, general, GDPR minimal).

   **Generate Retention Report:**
   ```
   GET /api/retention/report
   ```
   Generate and download a PDF report of all documents and their retention status.

3. **Present the results clearly:**

   **For expiring documents:**
   ```
   📋 Documents Expiring in the Next 30 Days

   • NDA with Acme Corp — Expires Feb 15, 2026
   • Employment Agreement — Expires Feb 20, 2026
   • Loan Documents — Expires Mar 1, 2026

   Total: 3 documents
   ```

   **For policy assignment:**
   ```
   ✓ Retention policy assigned

   Envelope: NDA with Acme Corp
   Policy: Healthcare (HIPAA)
   Retention: 7 years
   Auto-delete: No (flagged for manual review)
   ```

   **For available policies:**
   ```
   📚 Available Retention Policies

   Industry Presets:
   • Healthcare (HIPAA) — 7 years
   • Financial Services (SEC/FINRA) — 7 years
   • Tax Records (IRS) — 7 years
   • Employment Records — 5 years
   • General Business — 3 years
   • GDPR Minimal — 1 year (auto-delete)

   Custom Policies:
   • [list any custom policies]
   ```

## Error Handling

- If retention is not configured, explain that it's optional and provide setup guidance
- If a policy ID is invalid, list available policies
- If an envelope doesn't exist, return a clear error message

## Examples

**User:** "Which documents are expiring soon?"
**Claude:** [Calls GET /api/retention/expiring?days=60 and shows results]

**User:** "Assign the healthcare retention policy to this NDA"
**Claude:** [Identifies NDA envelope, looks up healthcare policy ID, calls POST /api/envelopes/{id}/retention]

**User:** "Show me all retention policies"
**Claude:** [Calls GET /api/retention/policies and presents in a clear format]

**User:** "Generate a retention report"
**Claude:** [Calls GET /api/retention/report and provides download link]

## Skill Integration

This command works with the `retention-compliance` skill to help users:
- Choose appropriate policies for their industry
- Understand legal retention requirements
- Balance data minimization (GDPR) with legal retention needs
