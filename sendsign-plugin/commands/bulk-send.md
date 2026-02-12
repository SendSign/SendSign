# /sendsign:bulk — Bulk Send

## Description
Send the same document to multiple recipients at once using a template.

## What Claude Should Do

### 1. Identify the Template
- If the user specifies a template, use that.
- If not, ask which template to use (or offer to create one).

### 2. Collect Recipient List
- Accept a CSV file, pasted table, or extraction from user context.
- Example: "Send this NDA to all vendors in vendors.csv"
- Map columns to signer fields: name, email, notification channel (email/sms/whatsapp).

### 3. Create Envelopes
Make the following API call for each recipient:

```
POST /api/envelopes/bulk
{
  "templateId": "template_abc123",
  "recipients": [
    { "name": "Alice", "email": "alice@example.com" },
    { "name": "Bob", "email": "bob@example.com" },
    ...
  ]
}
```

Or make individual calls if bulk endpoint is not available.

### 4. Confirm to the User
- Display:
  ```
  ✓ Created 15 envelopes from template 'Standard NDA'
  ✓ Sending now...
  
  Use `/sendsign:status` to track progress.
  ```

## Error Handling
- If CSV is malformed, ask for corrections.
- If some emails are invalid, list them and ask if Claude should skip or correct them.

## Examples

**User:** "Send the NDA template to all these vendors: alice@a.com, bob@b.com, charlie@c.com"

**Claude:**
1. Identifies "Standard NDA" template
2. Parses the email list
3. Creates 3 envelopes
4. Responds: "✓ Created 3 envelopes. Sending now. Each recipient will receive a signing link."
