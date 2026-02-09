# /coseal:template — Manage Templates

## Description
Create, list, and use reusable signing templates for frequently-used documents.

## What Claude Should Do

### Create a Template
**User:** "/coseal:template create"

1. Ask for the template name and description
2. Ask for the document to use as a template
3. Ask for signer roles (e.g., "Client", "Company Representative")
4. Place fields and associate them with roles
5. Create the template:

```
POST /api/templates
{
  "name": "Standard NDA",
  "description": "Two-party mutual NDA",
  "signers": [
    { "role": "Party A", "order": 1 },
    { "role": "Party B", "order": 2 }
  ],
  "fields": [...]
}
```

6. Confirm: "✓ Template created: Standard NDA (template_abc123)"

### List Templates
**User:** "/coseal:template list"

1. Fetch templates:

```
GET /api/templates
```

2. Display:
   ```
   Templates:
   - Standard NDA (template_abc123)
   - Employment Agreement (template_def456)
   ```

### Use a Template
**User:** "/coseal:send --template Standard NDA"

1. Fetch the template
2. Ask for actual signer names/emails for each role
3. Instantiate the envelope with the template fields
4. Send as usual

## Error Handling
- If template name already exists, suggest a different name.
- If template ID is not found, list available templates.

## Examples

**User:** "Create a template for our standard NDA"

**Claude:**
1. Asks for template details
2. User provides document and specifies 2 signers
3. Claude intelligently places fields
4. Creates template
5. Responds: "✓ Template 'Standard NDA' created. Use `/coseal:send --template Standard NDA` to send it."
