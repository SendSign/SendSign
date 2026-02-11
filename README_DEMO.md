# CoSeal Demo / Quick Start

Get CoSeal up and running in 5 minutes to see the signing UI in action.

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ running
- Git

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/ianquackenbos/CoSeal.git
cd CoSeal
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/coseal

# Server
PORT=3000
BASE_URL=http://localhost:3000

# Storage (local for demo)
STORAGE_TYPE=local
STORAGE_PATH=./storage

# Optional: Email (for testing, emails will be logged to console)
# SENDGRID_API_KEY=your-key-here
# SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

### 3. Initialize Database

```bash
npm run db:push
```

This creates all tables in your PostgreSQL database.

### 4. Seed Demo Data

```bash
npm run seed-demo
```

This creates:
- A demo organization
- A sample NDA document
- A signing envelope with 4 fields
- A signer with a signing token

**The script will print a signing URL like:**
```
🔗 SIGNING URL:
   http://localhost:3000/sign/abc123-def456-ghi789
```

Copy this URL — you'll use it in step 6.

### 5. Start the Server

```bash
npm run dev
```

Server starts on http://localhost:3000

### 6. Open the Signing UI

Open the signing URL from step 4 in your browser. You'll see:

- The sample NDA document
- 4 fields to fill out:
  - Signature field (draw or type)
  - Date field (auto-populated)
  - Full Name text field
  - Company text field
- "Sign & Submit" button

Fill out the fields and click submit to complete the signing flow!

## What to Try Next

### Send a Real Envelope via API

```bash
curl -X POST http://localhost:3000/api/envelopes \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "My First Envelope",
    "message": "Please sign this document",
    "signers": [
      {
        "name": "John Doe",
        "email": "john@example.com",
        "order": 1
      }
    ]
  }'
```

### Upload a PDF

```bash
curl -X POST http://localhost:3000/api/documents/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@/path/to/document.pdf"
```

### Create a Template

```bash
curl -X POST http://localhost:3000/api/templates \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NDA Template",
    "description": "Standard non-disclosure agreement",
    "documentKey": "path/to/uploaded/document"
  }'
```

## Signing UI Features

The demo envelope showcases:

✅ **PDF Rendering** — View documents directly in the browser  
✅ **Field Placement** — Visual indicators for where to sign  
✅ **Signature Capture** — Draw or type your signature  
✅ **Auto-fill** — Date fields populate automatically  
✅ **Validation** — Required fields must be completed  
✅ **Mobile Responsive** — Works on phones and tablets  
✅ **Progress Tracking** — See which fields are complete  
✅ **Audit Trail** — All actions are logged

## Troubleshooting

### Database Connection Error

Make sure PostgreSQL is running:
```bash
# macOS (Homebrew)
brew services start postgresql

# Linux (systemd)
sudo systemctl start postgresql

# Or check if it's running
psql -h localhost -U postgres -c "SELECT 1"
```

### Port Already in Use

Change the port in `.env`:
```
PORT=3001
BASE_URL=http://localhost:3001
```

### Signing URL Expired

Re-run the seed script:
```bash
npm run seed-demo
```

This generates a new signing token (valid for 7 days).

### Can't See PDF in Browser

Make sure the signing UI is built:
```bash
cd signing-ui
npm install
npm run build
cd ..
```

The built files should be in `signing-ui/dist/`.

## Next Steps

- Read `ARCHITECTURE.md` for technical details
- Check `docs/API.md` for full API reference
- See `BUILD_RECIPE.md` for development guide
- Deploy to production with `docs/DEPLOYMENT.md`

## Support

- **Issues**: https://github.com/ianquackenbos/CoSeal/issues
- **Docs**: https://github.com/ianquackenbos/CoSeal
- **License**: BSD-3-Clause
