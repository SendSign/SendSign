# Ecosystem Integrations Skill

## Purpose

Teach Claude about SendSign's integrations with enterprise tools and when to suggest them to users.

## Available Integrations

### **Slack** — Team Notifications

**What it does:**
- Posts notifications to a Slack channel when documents are sent, signed, or completed
- Interactive messages with envelope details
- Real-time visibility for the whole team

**When to suggest:**
- User mentions Slack in conversation
- User says "notify my team" or "team visibility"
- Compliance/audit needs (timestamped notifications)

**Configuration:**
```json
{
  "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX"
}
```

**Example suggestion:**
> "I see your team uses Slack. Would you like me to set up automatic notifications in a Slack channel when documents are signed? That way your team gets real-time updates."

---

### **Box** — Cloud Storage

**What it does:**
- Automatically uploads completed sealed documents to a Box folder
- Organizes by date or matter/deal name
- Centralized document storage

**When to suggest:**
- User mentions Box
- User asks "where do completed documents go?"
- Legal or finance teams (Box is popular in these industries)

**Configuration:**
```json
{
  "BOX_CLIENT_ID": "your-client-id",
  "BOX_CLIENT_SECRET": "your-client-secret",
  "BOX_ACCESS_TOKEN": "your-access-token",
  "BOX_FOLDER_ID": "123456789"
}
```

**Example suggestion:**
> "To keep all signed documents in one place, I can automatically upload them to Box after signing. Would you like me to set that up?"

---

### **Egnyte** — Cloud Storage

**What it does:**
- Auto-uploads completed documents to Egnyte
- Similar to Box, but for Egnyte users

**When to suggest:**
- User mentions Egnyte
- User is in financial services (Egnyte is popular in finance)

**Configuration:**
```json
{
  "EGNYTE_DOMAIN": "yourcompany",
  "EGNYTE_ACCESS_TOKEN": "your-access-token",
  "EGNYTE_FOLDER_PATH": "/Shared/Signatures"
}
```

---

### **Microsoft 365 / SharePoint** — Enterprise Storage

**What it does:**
- Uploads completed documents to OneDrive or SharePoint document library
- Integrates with Microsoft Graph API
- Works with Teams, SharePoint, OneDrive

**When to suggest:**
- User mentions Microsoft 365, SharePoint, OneDrive, or Teams
- Enterprise customers (M365 is ubiquitous in enterprise)

**Configuration:**
```json
{
  "MS365_TENANT_ID": "your-tenant-id",
  "MS365_CLIENT_ID": "your-app-id",
  "MS365_CLIENT_SECRET": "your-secret",
  "MS365_DRIVE_ID": "drive-id",
  "MS365_FOLDER_ID": "folder-id-or-root"
}
```

**Example suggestion:**
> "Since you're on Microsoft 365, I can automatically save signed documents to SharePoint. That way they're available in Teams and OneDrive. Want me to set that up?"

---

### **Google Drive** — Cloud Storage

**What it does:**
- Auto-uploads completed documents to Google Drive
- Uses service account authentication
- Works for Google Workspace teams

**When to suggest:**
- User mentions Google Drive or Google Workspace
- User asks about cloud storage options

**Configuration:**
```json
{
  "GOOGLE_SERVICE_ACCOUNT_KEY_PATH": "/path/to/service-account.json",
  "GOOGLE_DRIVE_FOLDER_ID": "folder-id"
}
```

---

### **Jira** — Project Management

**What it does:**
- Creates Jira tickets when documents are sent
- Adds comments when signers complete
- Attaches completed documents to tickets
- Transitions tickets to "Done" when complete

**When to suggest:**
- User mentions Jira
- User is managing a project with multiple documents
- User says "track signing status" or "project management"

**Configuration:**
```json
{
  "JIRA_URL": "https://yourcompany.atlassian.net",
  "JIRA_EMAIL": "user@company.com",
  "JIRA_API_TOKEN": "your-api-token",
  "JIRA_PROJECT_KEY": "SIGN"
}
```

**Example suggestion:**
> "I notice you're managing multiple documents for this project. Would you like me to create Jira tickets for each one? That way you can track signing progress in Jira alongside your other work."

---

## When to Proactively Suggest Integrations

**During envelope creation:**
If the user mentions any of these tools, suggest the integration immediately:
> "By the way, I can automatically post to your Slack channel when this gets signed. Want me to set that up?"

**When user asks "what happens after signing?"**
Explain the options:
> "After all signers complete, you can download the sealed PDF. I can also automatically:
> - Upload to Box, Egnyte, Google Drive, or SharePoint
> - Post a notification to Slack
> - Create a Jira ticket with the attached document
>
> Which would be helpful for your team?"

**When user mentions compliance/audit needs:**
> "For audit trails, I can integrate with Slack (timestamped notifications) and your cloud storage (automatic backups). Would you like both?"

**When user mentions team collaboration:**
> "To keep your team in the loop, I recommend:
> - Slack: Real-time notifications
> - Jira: Track signing as part of your project
>
> Which does your team use?"

## Configuration Help

**When user wants to enable an integration:**

1. Explain what credentials they need (see above)
2. Guide them to create app credentials in the service:
   - **Slack**: Create incoming webhook in Slack workspace settings
   - **Box**: Create Box app, get OAuth token
   - **Jira**: Generate API token from Atlassian account settings
   - **Google Drive**: Create service account, download JSON key
   - **Microsoft 365**: Register app in Azure AD, get client credentials

3. Call the API to enable:
   ```
   POST /api/integrations/slack
   {
     "config": {
       "SLACK_WEBHOOK_URL": "..."
     }
   }
   ```

4. Test the connection:
   ```
   POST /api/integrations/slack/test
   ```

## Multiple Integrations

Users can enable multiple integrations simultaneously:
- Slack for notifications + Box for storage
- Jira for project tracking + Microsoft 365 for document management

**Example multi-integration suggestion:**
> "I can set up:
> 1. **Slack** — notify your team when documents are signed
> 2. **Box** — automatically archive signed documents
> 3. **Jira** — create tickets for each signing request
>
> Which of these would be useful?"

## Troubleshooting

**"Integration failed"**
- Check credentials are correct
- Verify API tokens haven't expired
- Use the test endpoint: `POST /api/integrations/:name/test`

**"Documents not uploading"**
- Check folder permissions
- Verify folder IDs are correct
- Check storage quota hasn't been exceeded

**"Slack not receiving messages"**
- Verify webhook URL is from Slack workspace settings
- Check webhook hasn't been revoked

## Best Practices

✅ **Do:**
- Test integrations immediately after setup
- Use separate folders/channels for SendSign notifications
- Set up integrations before sending important documents
- Enable multiple integrations for redundancy

❌ **Don't:**
- Share API tokens in chat or documentation
- Use personal accounts for team integrations
- Enable integrations without testing first
- Forget to grant necessary permissions (folder access, channel posting, etc.)

## Privacy Considerations

**What data is sent to integrations:**
- Envelope subject, ID, status
- Signer names and email addresses
- Completion timestamps
- Full document PDF (for storage integrations)

**What data is NOT sent:**
- API keys or internal credentials
- Full audit trail (unless explicitly exported)
- Field values or form data (only in the PDF)

**For GDPR compliance:**
- Only enable storage integrations if you have legal basis
- Ensure integrated services have proper DPAs in place
- Use retention policies to auto-delete from SendSign (integrated services keep their own copies)
