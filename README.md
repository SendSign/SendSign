# SendSign

> E-signatures for the AI era. The first e-signature platform built for AI agents.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?logo=docker&logoColor=white)](https://www.docker.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Website](https://sendsign.dev) · [Documentation](ARCHITECTURE.md) · [Deployment Guide](DEPLOY.md)

---

## What is SendSign?

SendSign is an open-source e-signature platform designed for AI agents, not humans clicking through web forms. Send documents for legally-binding electronic signature from Anthropic Cowork, any MCP client, or via a simple REST API.

**The missing piece:** Anthropic's Legal plugin handles Review → Redline. SendSign handles Sign → Seal.

## Quick Start

```bash
git clone https://github.com/sendsign/sendsign.git
cd sendsign
cp .env.example .env
docker compose up
```

Visit **http://localhost:3000**

See [README_DEMO.md](README_DEMO.md) for a detailed quick start guide.

---

## Features

### For AI Agents
- **🤖 MCP Native** — 17 MCP tools for AI agent integration
- **🔌 Cowork Plugin** — Install in 30 seconds, works instantly
- **📡 REST API** — Simple endpoints: create, send, track, download
- **🧠 Template Learning** — Place fields once, AI handles the rest

### Core Capabilities
- **✅ Legally Binding** — ESIGN Act (US) + eIDAS (EU) compliant
- **🔔 Webhooks** — Real-time event notifications
- **📊 Bulk Send** — Send to hundreds at once via CSV upload
- **🔐 Audit Trail** — SHA-256 hashing, IP logging, completion certificates
- **📋 Templates** — Reusable layouts with automatic field placement
- **🎨 White-Label** — Custom branding (commercial license)
- **🔗 Embedded Signing** — iframe integration for your app

### Technical
- **🐘 PostgreSQL** — with Row-Level Security (RLS) for multi-tenancy
- **🔒 Encrypted Storage** — AES-256-GCM for documents at rest
- **📦 Docker** — One-command deployment
- **🌍 Self-Hosted** — Your data, your infrastructure
- **☁️ S3 Compatible** — AWS S3, MinIO, Backblaze, or local filesystem

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AI Agents (Claude Cowork, MCP Clients)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │ MCP Protocol
┌─────────────────────▼───────────────────────────────────────┐
│  SendSign MCP Server                                        │
│  (17 tools: create, send, track, template, bulk, etc.)     │
└─────────────────────┬───────────────────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────────────────┐
│  SendSign API Server                                        │
│  • Envelope Management    • Template Engine                 │
│  • Signing Ceremony       • Webhook Delivery                │
│  • PDF Sealing            • Multi-Tenant Isolation          │
└─────────────────────┬───────────────────────────────────────┘
                      │
      ┌───────────────┼───────────────┐
      │               │               │
      ▼               ▼               ▼
  PostgreSQL    S3 Storage      SMTP/SMS
   (RLS)         (Encrypted)    (Notifications)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation.

---

## Self-Hosting

### Requirements
- Docker & Docker Compose
- PostgreSQL 16+
- Node.js 20+ (for development)

### Deployment

**Docker (Recommended):**
```bash
docker compose -f docker-compose.prod.yml up -d
```

**Railway:**
```bash
# Connect your repo to Railway
# Set environment variables
# Deploy automatically from Dockerfile
```

**Fly.io:**
```bash
fly launch
fly postgres create
fly secrets set SENDSIGN_CONTROL_API_KEY=xxx ...
fly deploy
```

See [DEPLOY.md](DEPLOY.md) for complete deployment instructions including Railway, Fly.io, AWS, and GCP.

---

## Managed Hosting

Don't want to self-host? We run it for you.

**$29/mo** — Unlimited envelopes, up to 5 users, automatic updates, 30-day audit log, email support.

[Get Started →](https://sendsign.dev)

---

## Cowork Plugin

Send documents for signature directly from Anthropic Cowork:

1. **Download** the plugin from your SendSign dashboard
2. **Drag** the `.claude-plugin` folder into any Cowork project
3. **Say** "Send this NDA to jane@acme.com for signature"
4. **Done** — Claude handles envelope creation, field placement, and sending

The plugin includes:
- 17 MCP tools for envelope management
- Slash commands: `/sendsign:remind`, etc.
- Automatic template matching
- Bulk send from CSV files

---

## API Usage

### Create and Send an Envelope

```bash
# Create envelope
curl -X POST https://your-instance.com/api/envelopes \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "NDA for Review",
    "signers": [
      {
        "email": "jane@example.com",
        "name": "Jane Smith",
        "order": 1
      }
    ]
  }'

# Upload document
curl -X POST https://your-instance.com/api/envelopes/{id}/documents \
  -H "x-api-key: YOUR_API_KEY" \
  -F "file=@contract.pdf"

# Send for signature
curl -X POST https://your-instance.com/api/envelopes/{id}/send \
  -H "x-api-key: YOUR_API_KEY"
```

See [docs/API.md](docs/API.md) for complete API reference.

---

## SDK

```bash
npm install @sendsign/sdk
```

```typescript
import { SendSignClient } from '@sendsign/sdk';

const client = new SendSignClient({
  apiKey: 'YOUR_API_KEY',
  baseUrl: 'https://your-instance.com'
});

// Create envelope
const envelope = await client.createEnvelope({
  subject: 'NDA for Review',
  signers: [{ email: 'jane@example.com', name: 'Jane Smith', order: 1 }]
});

// Add document
await client.addDocument(envelope.id, './contract.pdf');

// Send for signature
await client.sendEnvelope(envelope.id);

// Check status
const status = await client.getEnvelopeStatus(envelope.id);
console.log(`Status: ${status.status}`);
```

---

## Tech Stack

- **Backend:** Node.js 20 + TypeScript 5 + Express.js
- **Database:** PostgreSQL 16 with Row-Level Security (RLS)
- **ORM:** Drizzle ORM with full type safety
- **PDF:** pdf-lib (manipulation) + PDF.js (rendering)
- **Crypto:** node-forge (X.509, SHA-256, PKCS#7 digital signatures)
- **Frontend:** React 18 + Vite + Tailwind CSS (signing UI)
- **Storage:** S3-compatible (AWS S3, MinIO, Backblaze) or local filesystem
- **Email:** SendGrid or SMTP
- **SMS:** Twilio (optional for OTP verification)

---

## Pricing

### Self-Hosted (Free)
- ✅ Open source (AGPL-3.0)
- ✅ Unlimited envelopes
- ✅ Unlimited users
- ✅ Full API + MCP + webhooks
- ✅ Templates
- ✅ "Powered by SendSign" badge
- ✅ Community support (GitHub)

### Managed ($29/mo)
- ✅ Everything in Self-Hosted
- ✅ We host and maintain it
- ✅ Up to 5 users
- ✅ Automatic updates
- ✅ 30-day audit log
- ✅ Email support

### White-Label (Custom)
- ✅ Everything in Managed
- ✅ Custom branding (your logo, colors)
- ✅ Commercial license (removes AGPL)
- ✅ SSO (SAML 2.0 + OIDC)
- ✅ Unlimited users
- ✅ Audit log export + unlimited retention
- ✅ Custom RBAC roles
- ✅ Embedded signing (iframe)
- ✅ Dedicated support + SLA

**Contact:** enterprise@sendsign.dev

---

## Comparison to DocuSign

| Feature | SendSign | DocuSign |
|---------|----------|----------|
| **Built for AI** | ✅ MCP-native | ❌ Web forms only |
| **Open Source** | ✅ AGPL-3.0 | ❌ Proprietary |
| **Self-Host** | ✅ Free | ❌ Cloud only |
| **API** | ✅ Simple REST | ⚠️ Complex OAuth |
| **Template Learning** | ✅ Auto field placement | ❌ Manual setup |
| **Pricing** | ✅ $29/mo or free | ❌ $65/user/mo+ |
| **Vendor Lock-in** | ❌ None | ✅ Yes |
| **Legally Binding** | ✅ ESIGN + eIDAS | ✅ ESIGN + eIDAS |

---

## Compliance

- **ESIGN Act (US):** Fully compliant for electronic signatures
- **eIDAS (EU):** Supports Simple Electronic Signatures (SES) and Advanced Electronic Signatures (AES)
- **GDPR:** Data encryption, audit logs, right to erasure
- **SOC 2:** Available for white-label customers
- **QES (Qualified Electronic Signatures):** Integrations with Swisscom AIS and Namirial TSPs

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone the repo
git clone https://github.com/sendsign/sendsign.git
cd sendsign

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Start PostgreSQL
docker compose up postgres -d

# Run migrations
npm run db:push

# Start dev server
npm run dev
```

Visit **http://localhost:3000**

---

## License

**AGPL-3.0** — See [LICENSE](LICENSE) for details.

This means:
- ✅ You can use SendSign for free
- ✅ You can modify and distribute SendSign
- ✅ You can offer SendSign as a service (SaaS)
- ⚠️ You must open-source any modifications you distribute or offer as a service
- ⚠️ "Powered by SendSign" badge must remain visible

**Commercial licenses** available for white-label deployments without the AGPL restrictions. Contact **enterprise@sendsign.dev**.

---

## Support

- **Documentation:** [ARCHITECTURE.md](ARCHITECTURE.md) · [DEPLOY.md](DEPLOY.md) · [API Docs](docs/API.md)
- **Issues:** [GitHub Issues](https://github.com/sendsign/sendsign/issues)
- **Discussions:** [GitHub Discussions](https://github.com/sendsign/sendsign/discussions)
- **Email:** hello@sendsign.dev
- **Managed/White-Label:** enterprise@sendsign.dev

---

## Roadmap

- [x] Core e-signature engine
- [x] MCP server + Cowork plugin
- [x] Template system with auto field placement
- [x] Bulk send via CSV
- [x] Webhooks
- [x] Multi-tenancy with RLS
- [x] Stripe billing integration
- [ ] Mobile app (React Native)
- [ ] Advanced workflows (conditional routing)
- [ ] In-person signing (tablet mode)
- [ ] Notary integration
- [ ] QES support for EU compliance
- [ ] Salesforce integration

---

## Acknowledgments

Built with:
- [Anthropic Claude](https://www.anthropic.com) — AI assistance
- [Model Context Protocol](https://modelcontextprotocol.io) — AI agent integration
- [Drizzle ORM](https://orm.drizzle.team) — Type-safe database layer
- [pdf-lib](https://pdf-lib.js.org) — PDF manipulation
- [node-forge](https://github.com/digitalbazaar/forge) — Cryptography

---

**Made with ❤️ for AI agents**

[Website](https://sendsign.dev) · [GitHub](https://github.com/sendsign/sendsign) · [Twitter](https://twitter.com/sendsigndev)
