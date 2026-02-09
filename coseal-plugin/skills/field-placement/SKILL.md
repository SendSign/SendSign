# Field Placement Skill

## Purpose
Teach Claude how to intelligently place signature fields on contracts so they appear in natural, expected locations.

## Default Placement Rules

### Signature Fields

**Standard contracts:**
- Place signature fields on the **last page** of the document
- Position in the **signature block** area (usually bottom third of the page)
- If the document has explicit signature lines (horizontal lines with "Signature:" or "Signed:"), place fields directly above those lines
- Default size: 200px wide × 50px tall

**Multi-party agreements:**
- Each party gets their own signature field
- Place fields vertically stacked if on the same page
- If signature blocks are side-by-side, place fields horizontally
- Leave 20px spacing between fields

### Initial Fields

**When to use:**
- Documents with multiple pages (≥3 pages)
- Legal documents that require initialing each page
- Contracts with amendments or addendums

**Placement:**
- Bottom right corner of each page except the last (signature page)
- Or bottom left if that's where existing initials appear
- Default size: 80px × 30px

### Date Fields

**Always place date fields:**
- Immediately to the right of each signature field
- Or directly below if space is tight
- Default size: 120px × 30px
- Default format: MM/DD/YYYY (can be configured for other regions)

### Text Fields

**Use for:**
- Blank spaces labeled "Name:", "Title:", "Company:"
- Form fields that signers need to fill in
- Witness names or notary information

**Placement:**
- Directly over the blank line or box
- Size to fit the available space
- Respect document formatting (don't obscure existing text)

### Checkbox Fields

**Use for:**
- Option selections (e.g., "☐ I agree to receive marketing emails")
- Consent acknowledgments
- Multiple choice items

**Placement:**
- Directly over the checkbox box in the document
- Or to the left of the statement if no existing box
- Default size: 15px × 15px

## Intelligent Detection

Claude should analyze the document to detect:

1. **Signature blocks**: Look for text patterns like:
   - "Signature:", "Signed:", "By:", "_______________________"
   - "Authorized Signature", "Party A", "Party B"

2. **Date indicators**: Look for:
   - "Date:", "Date Signed:", "Dated:", "_______ (date)"

3. **Form fields**: Look for:
   - Underscores or dots indicating blank spaces: "______", "..........."
   - Square brackets or boxes: "[ ]", "☐"
   - Labels ending in colons: "Name:", "Title:", "Address:"

4. **Multiple signature pages**: Some documents have separate signature pages for each party

## Anchor-Based Placement

If CoSeal's anchor-tag feature is available, Claude can use it to automatically place fields:

```json
{
  "anchorString": "Signature:",
  "anchorMatchMode": "startsWith",
  "offsetX": 0,
  "offsetY": -5,
  "placement": "below"
}
```

This is more robust than absolute positioning since it adapts to document formatting.

## Validation Rules

Before placing fields, Claude should verify:

1. **Fields don't overlap**: Each field has at least 5px spacing from other fields
2. **Fields fit on the page**: No field extends beyond page boundaries
3. **Fields don't obscure important text**: Avoid placing fields over existing contract language
4. **Required fields are present**: Every signer has at least one signature field

## Coordinate System

CoSeal uses percentage-based coordinates:
- `x` and `y` are percentages of page width/height (0-100)
- `width` and `height` are percentages of page dimensions

This ensures fields scale correctly across different PDF viewers and screen sizes.

## Example Field Configuration

```json
{
  "type": "signature",
  "signer": "alice@example.com",
  "page": 3,
  "x": 15,
  "y": 20,
  "width": 35,
  "height": 8,
  "required": true
}
```

## Special Cases

### PowerForms (self-service signing)
- Place a text field at the top for "Your Name" and "Your Email"
- Then standard signature/date fields
- Add instructions: "Please enter your information below and sign"

### Witness signatures
- If the document requires witnesses, place witness fields below the primary signature
- Include: Witness Signature, Witness Name (text), Witness Date

### Notary blocks
- If notarization is required, reserve space for notary seal and signature
- Typically bottom of last page or separate notary page

## Error Handling

If field placement fails:
- **Insufficient space**: Ask the user if they want to add a signature page
- **Ambiguous signature blocks**: Ask the user to manually specify where to place fields
- **No signature indicators found**: Place fields in standard locations (bottom of last page)

## Example

**User:** "Place signature fields for Alice and Bob on this contract."

**Claude:**
1. Analyzes the PDF
2. Finds a signature block on page 4 with two signature lines
3. Places:
   - Alice's signature field above the first line (x: 10%, y: 30%, width: 30%, height: 6%)
   - Bob's signature field above the second line (x: 10%, y: 45%, width: 30%, height: 6%)
   - Date fields to the right of each signature (x: 50%, y: 30% and 45%, width: 20%, height: 6%)
4. Confirms: "✓ Placed signature and date fields for Alice and Bob on page 4."
