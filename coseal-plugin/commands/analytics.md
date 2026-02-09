# /coseal:analytics — View Analytics

## Description
Display summary statistics and recent activity for signing envelopes.

## What Claude Should Do

### 1. Fetch Analytics Data
Make the following API call:

```
GET /api/admin/analytics?period=30d
```

Response:
```json
{
  "summary": {
    "totalEnvelopes": 150,
    "completed": 120,
    "pending": 25,
    "voided": 5,
    "completionRate": 0.80,
    "avgTimeToComplete": "2.5 days"
  },
  "recentEvents": [
    { "envelopeId": "env_abc", "action": "signed", "signer": "Alice", "timestamp": "..." },
    ...
  ]
}
```

### 2. Display Summary

```
📊 CoSeal Analytics (Last 30 Days)

Total Envelopes: 150
✓ Completed: 120 (80%)
⏳ Pending: 25
🚫 Voided: 5

Average Time to Complete: 2.5 days

Recent Activity:
- Alice signed "NDA - Acme Corp" (2 hours ago)
- Bob completed "Employment Agreement" (5 hours ago)
- ...
```

### 3. Highlight Issues
- If there are envelopes pending for > 48 hours, list them.
- Suggest: "3 envelopes are overdue. Would you like to send reminders?"

## Error Handling
- If analytics endpoint is not available, inform the user this feature requires API updates.

## Examples

**User:** "/coseal:analytics"

**Claude:**
1. Fetches analytics
2. Displays summary with completion rate and recent activity
3. Highlights: "5 envelopes have been pending for over 3 days. Want me to send reminders?"
