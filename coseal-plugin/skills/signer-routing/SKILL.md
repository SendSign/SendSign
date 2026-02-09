# Signer Routing Skill

## Purpose
Teach Claude about sequential vs parallel signing, when each is appropriate, and how to determine signing order from contract context.

## Routing Strategies

### 1. Sequential Routing (One-by-One)

**When to use:**
- **Hierarchical approvals**: Junior → Senior → Executive
- **Dependent signatures**: One party needs to review what the other signed
- **Legal requirements**: Some jurisdictions or contract types require specific signing order
- **Countersigning**: One party signs first, the other reviews and countersigns

**Examples:**
- Employment agreements: Employee signs → Manager approves → HR finalizes
- Purchase orders: Requester → Budget approver → Procurement
- Vendor contracts: Vendor signs → Legal reviews → Company signs

**How it works:**
1. Signer 1 receives the link immediately
2. After Signer 1 completes, Signer 2 receives the link
3. After Signer 2 completes, Signer 3 receives the link
4. And so on...

**Configuration:**
```json
{
  "signingOrder": "sequential",
  "signers": [
    { "name": "Alice", "email": "alice@example.com", "order": 1 },
    { "name": "Bob", "email": "bob@example.com", "order": 2 },
    { "name": "Charlie", "email": "charlie@example.com", "order": 3 }
  ]
}
```

### 2. Parallel Routing (All at Once)

**When to use:**
- **Peer agreements**: Two companies forming a partnership
- **Mutual agreements**: NDAs, service agreements between equals
- **No dependencies**: Signers don't need to see each other's signatures first
- **Speed**: When you want to minimize time-to-completion

**Examples:**
- Mutual NDAs between two companies
- Partnership agreements
- Lease agreements (landlord and tenant sign independently)

**How it works:**
1. All signers receive links at the same time
2. Each can sign in any order
3. Envelope completes when the last signer finishes

**Configuration:**
```json
{
  "signingOrder": "parallel",
  "signers": [
    { "name": "Alice", "email": "alice@example.com", "order": 1 },
    { "name": "Bob", "email": "bob@example.com", "order": 1 }
  ]
}
```

Note: All signers have `order: 1` for parallel routing.

### 3. Mixed Routing (Groups)

**When to use:**
- **Complex workflows**: Multiple stages, some parallel within each stage
- **Board approvals**: Multiple board members sign in parallel, then CEO signs last
- **Multi-party contracts**: Vendors sign in parallel, then client reviews and signs

**Examples:**
- Contract workflow: Legal team (3 people, parallel) → CFO → CEO (sequential after legal)
- Vendor onboarding: Vendor representative + Vendor legal (parallel) → Company procurement (sequential after vendor)

**How it works:**
1. Group 1 (all signers with `order: 1`) receives links and signs in parallel
2. When all Group 1 members complete, Group 2 (order: 2) receives links
3. Group 2 signs in parallel
4. When all Group 2 members complete, Group 3 (order: 3) receives links
5. And so on...

**Configuration:**
```json
{
  "signingOrder": "mixed",
  "signers": [
    { "name": "Alice", "email": "alice@example.com", "order": 1, "signingGroup": "legal" },
    { "name": "Bob", "email": "bob@example.com", "order": 1, "signingGroup": "legal" },
    { "name": "Charlie", "email": "charlie@example.com", "order": 2, "signingGroup": "finance" }
  ]
}
```

## Determining Signing Order from Context

Claude should infer the appropriate signing order by analyzing:

### Document Type
- **NDAs**: Usually parallel (mutual agreement)
- **Employment agreements**: Sequential (employee first, then employer)
- **Vendor contracts**: Mixed or sequential (vendor first, then company)
- **Approval documents**: Sequential (lowest to highest authority)

### Parties Involved
- **Two peer entities** (Company A ↔ Company B): Parallel
- **Employee ↔ Company**: Sequential (employee first)
- **Customer ↔ Vendor**: Parallel or sequential (ask user)
- **Multiple approvers in a hierarchy**: Sequential by seniority

### User Phrasing
- "Send to Alice and Bob" → Parallel (implies both at once)
- "Alice needs to sign first, then Bob" → Sequential
- "Get Alice's signature, then route to Bob" → Sequential
- "All three executives need to approve, then the CEO signs" → Mixed

## Conditional Routing

CoSeal supports conditional routing where the next signer depends on a field value or previous signer's action:

**Example:**
- If "Amount" > $10,000 → route to CFO
- If "Amount" ≤ $10,000 → route to Manager

**Configuration:**
```json
{
  "routingRules": [
    {
      "condition": "field:amount > 10000",
      "nextSignerId": "cfo@company.com"
    },
    {
      "condition": "field:amount <= 10000",
      "nextSignerId": "manager@company.com"
    }
  ]
}
```

Claude should suggest conditional routing when:
- The user mentions thresholds or conditions
- Different approval paths exist based on document content
- Routing depends on the type of document or specific fields

## Questions to Ask the User

If signing order is ambiguous, Claude should ask:

1. "Should all signers receive the document at the same time, or is there a specific order?"
2. "Does anyone need to sign before others can see it?"
3. "Is there an approval hierarchy I should follow?"
4. "Would you like me to suggest a signing order based on typical workflows for this document type?"

## Handling Signing Order Changes

If the user wants to change signing order after creating the envelope:

- **Before sending**: Edit the envelope (update signer order)
- **After sending**: Use envelope correction to modify routing, but warn that signers who already received links will get new links

## Example Scenarios

**Scenario 1: Simple NDA**
- User: "Send this NDA to alice@acme.com and bob@ventures.com"
- Claude infers: Mutual NDA, peer parties → **Parallel routing**

**Scenario 2: Employment Agreement**
- User: "Send the employment agreement to the new hire and the hiring manager"
- Claude infers: Employee signs first, manager countersigns → **Sequential routing** (employee, then manager)

**Scenario 3: Board Resolution**
- User: "The board resolution needs signatures from the 5 board members, then the CEO"
- Claude infers: Board members can sign independently, CEO signs last → **Mixed routing** (board members in parallel as Group 1, CEO as Group 2)

**Scenario 4: Conditional Approval**
- User: "If the contract value is over $50k, it needs legal approval after sales signs"
- Claude infers: Conditional routing based on field value → Suggests **conditional routing** with amount threshold

## Best Practices

1. **Default to parallel** unless there's a clear reason for sequential
2. **Ask when ambiguous** — don't guess if the order matters
3. **Explain the choice**: "I'll send this to both parties at the same time so they can sign independently"
4. **Consider time-to-completion**: Parallel routing is faster, but sequential may be required for some workflows
5. **Check regulatory requirements**: Some industries require specific signing orders
