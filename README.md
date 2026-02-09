# CoSeal

### The open-source e-signature engine that completes what Cowork Legal started.

---

Claude's [Legal plugin](https://claude.com/plugins/legal) reviews your contracts, redlines them against your playbook, triages NDAs, and routes documents for approval. Then it stops. You still need DocuSign to get the thing signed.

**CoSeal closes that gap.**

CoSeal is an open-source e-signature service and Cowork plugin that adds document signing directly into the Claude workflow. Review a contract with `/review-contract`. Get alignment with `/triage-nda`. Then send it for signature with `/coseal:send`. The entire lifecycle — from first draft to fully executed agreement — happens without leaving Claude.

No per-envelope fees. No seat licenses. No vendor lock-in. Just cryptographically sealed, legally valid signatures.

---

## Why CoSeal Exists

On January 30, 2026, Anthropic released 11 plugins for Claude Cowork. The Legal plugin automated contract review, NDA triage, compliance checks, and document routing — work that legal teams and SaaS vendors had charged thousands for. Markets reacted. Thomson Reuters dropped 16%. RELX fell 14%. DocuSign lost 11%.

But here's the thing: **DocuSign shouldn't have dropped at all.** The Legal plugin doesn't do signatures. It does everything *around* signatures. There was still a gap — and DocuSign still owned it.

CoSeal fills that gap. And it's free.

---

## How It Works

CoSeal has two components:

**1. The Cowork Plugin** — installs alongside the Legal plugin and adds signing commands to your Claude workflow.

**2. The Signing Service** — a lightweight, self-hosted microservice that handles document preparation, the signing ceremony, cryptographic sealing, and audit trail generation.

The plugin talks to the service via MCP (Model Context Protocol), the same standard the Legal plugin uses to connect to Slack, Box, and Microsoft 365.

### The Workflow

```
You:        "Review this MSA and send to counterparty for signature."

Claude:     /review-contract → flags 3 issues (2 YELLOW, 1 RED)
            Suggests redlines based on your playbook
            You approve the final version

Claude:     /coseal:send → prepares the document
            Assigns signature fields to each party
            Sends secure signing links via email

Signer:     Opens link → reviews document → signs

Claude:     /coseal:status → "Fully executed. Filed to Matter #2847."
            Sealed PDF with Certificate of Completion in your workspace
```

No tab switching. No uploading to a third-party platform. No per-envelope charges.

---

## Commands

| Command | Description |
|---|---|
| `/coseal:send` | Prepare and send a document for signature. Specify signers, signing order, and field placement. |
| `/coseal:status` | Check the status of any pending or completed envelope. |
| `/coseal:remind` | Send a reminder to signers who haven't signed yet. |
| `/coseal:void` | Void a pending envelope before all parties have signed. |
| `/coseal:download` | Download the sealed, fully executed PDF with its Certificate of Completion. |
| `/coseal:templates` | Manage reusable document templates with pre-configured signature fields. |

All commands integrate with the Legal plugin's output. When you run `/review-contract` and approve the result, `/coseal:send` picks up the final document automatically.

---

## What Makes a Signature Legally Valid

Less than you think. Under the U.S. [ESIGN Act](https://www.congress.gov/106/plaws/publ229/PLAW-106publ229.htm) (2000) and [UETA](https://www.uniformlaws.org/committees/community-home?CommunityKey=2c04b76c-2b7d-4399-977e-d5876ba7e034) (adopted by 49 states), an electronic signature is legally binding if:

- **Intent to sign** — the signer meant to sign (clicking "Sign" satisfies this)
- **Consent to do business electronically** — the signer agreed to use e-signatures
- **Association of signature with record** — the system connects the signature to the document
- **Record retention** — the signed document is stored and reproducible

That's it. There is no legal requirement to use DocuSign, or any specific vendor. There is no legal requirement for a particular technology. The law is intentionally technology-neutral.

CoSeal satisfies all four requirements and adds cryptographic tamper-evidence on top — which the law doesn't even require, but which makes your signatures *stronger* than the legal minimum.

For EU/UK transactions, CoSeal supports Advanced Electronic Signatures (AES) under eIDAS, with Qualified Electronic Signature (QES) support on the roadmap via integration with trust service providers.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Claude Cowork                    │
│                                                  │
│  ┌──────────────┐      ┌──────────────────────┐ │
│  │ Legal Plugin  │      │   CoSeal Plugin      │ │
│  │              │      │                      │ │
│  │ /review      │─────▶│ /coseal:send         │ │
│  │ /triage-nda  │      │ /coseal:status       │ │
│  │ /brief       │      │ /coseal:download     │ │
│  └──────────────┘      └──────────┬───────────┘ │
│                                   │ MCP          │
└───────────────────────────────────┼──────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │       CoSeal Service          │
                    │                               │
                    │  ┌─────────┐  ┌────────────┐  │
                    │  │ Document│  │  Workflow   │  │
                    │  │   Prep  │  │   Engine    │  │
                    │  └────┬────┘  └─────┬──────┘  │
                    │       │             │         │
                    │  ┌────▼────┐  ┌─────▼──────┐  │
                    │  │ Signing │  │   Crypto    │  │
                    │  │Ceremony│  │   Sealing   │  │
                    │  └────┬────┘  └─────┬──────┘  │
                    │       │             │         │
                    │  ┌────▼─────────────▼──────┐  │
                    │  │     Audit Trail &        │  │
                    │  │     Storage Layer        │  │
                    │  └─────────────────────────┘  │
                    └───────────────────────────────┘
```

### Signing Service Components

| Component | Purpose | Tech |
|---|---|---|
| **Document Prep** | PDF rendering, signature field placement, multi-party field assignment | pdf-lib, PDF.js |
| **Workflow Engine** | Sequential/parallel signing, conditional routing, reminders, expiry, delegation | Node.js |
| **Signing Ceremony** | Secure tokenized URLs, signer identity capture, signature application | React SPA |
| **Crypto Sealing** | SHA-256 document hashing, X.509 certificate embedding, Certificate of Completion | node-forge |
| **Audit Trail** | Immutable log of every action — opens, views, signs, IP addresses, timestamps | PostgreSQL |
| **Storage** | Encrypted document storage with configurable retention policies | S3-compatible + KMS |
| **Notifications** | Email and SMS to signers at each stage | SendGrid, Twilio |
| **Identity** | Email verification, SMS OTP, optional ID verification for AES/QES | Twilio Verify, Jumio |

### Self-Hosting

CoSeal is designed to run anywhere. A single `docker-compose up` gets you the full stack:

```yaml
# docker-compose.yml
services:
  coseal-api:
    image: ghcr.io/coseal-sign/coseal-service:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://coseal:coseal@db:5432/coseal
      - S3_BUCKET=coseal-documents
      - SENDGRID_API_KEY=your-key
      - SIGNING_CERT_PATH=/certs/coseal.pem
    volumes:
      - ./certs:/certs

  coseal-ui:
    image: ghcr.io/coseal-sign/coseal-ui:latest
    ports:
      - "3001:3001"

  db:
    image: postgres:16
    environment:
      - POSTGRES_DB=coseal
      - POSTGRES_USER=coseal
      - POSTGRES_PASSWORD=coseal
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

For production, swap in your own S3 bucket, managed Postgres, and TLS certs. CoSeal doesn't phone home, doesn't require a license key, and never sees your documents unless you point it at our hosted instance (coming soon).

---

## Compared to DocuSign

| | DocuSign | CoSeal |
|---|---|---|
| **Legally binding** | Yes | Yes — same laws, same enforceability |
| **Audit trail** | Yes | Yes — cryptographic, immutable, self-hosted |
| **Tamper evidence** | Yes | Yes — SHA-256 + X.509 |
| **Multi-party signing** | Yes | Yes — sequential, parallel, conditional |
| **Identity verification** | Email, SMS, ID check | Email, SMS, ID check, government ID, SSO/SAML |
| **eIDAS SES/AES** | Yes | Yes |
| **eIDAS QES** | Yes (via partners) | Yes (via Swisscom, Namirial) |
| **Enterprise SSO** | Yes | Yes — SAML 2.0, OpenID Connect |
| **Retention policies** | Yes | Yes — industry presets + custom |
| **Integrations** | 400+ | Slack, M365, Box, Egnyte, Jira, Google Drive (extensible) |
| **AI contract review** | No | Yes — via Cowork Legal plugin |
| **AI redlining** | No | Yes — via Cowork Legal plugin |
| **AI NDA triage** | No | Yes — via Cowork Legal plugin |
| **TypeScript SDK** | Yes | Yes — `@coseal/sdk` |
| **Embeddable** | Yes | Yes — iframe + postMessage API |
| **Self-hosted** | No | Yes — Docker, Kubernetes, Helm, Terraform |
| **Open source** | No | Yes — Apache 2.0 |
| **Per-envelope fee** | $1.50–$2.50+ | $0 |
| **Per-seat license** | $10–$65/mo | $0 |
| **Vendor lock-in** | Yes | No — your data, your infrastructure |

---

## Features

### Core Signing
- [x] Document preparation with drag-and-drop signature field placement
- [x] Multi-party signing — sequential, parallel, or conditional routing
- [x] Signing ceremony with secure tokenized URLs
- [x] Signature capture — draw, type, or upload
- [x] SHA-256 document hashing + X.509 cryptographic sealing
- [x] Certificate of Completion with full audit trail
- [x] Immutable audit trail — every action logged with IP, timestamp, user agent
- [x] Email and SMS notifications at every stage
- [x] Reminder automation and envelope expiry
- [x] Template management for reusable document types
- [x] Webhook callbacks for external integrations
- [x] One-command Docker deployment

### Compliance
- [x] ESIGN Act (US) compliant
- [x] UETA (49 states) compliant
- [x] eIDAS Simple Electronic Signatures (SES)
- [x] eIDAS Advanced Electronic Signatures (AES) — two-factor and government ID verification
- [x] eIDAS Qualified Electronic Signatures (QES) — via Trust Service Provider integration (Swisscom, Namirial)
- [x] Industry-specific retention policies — healthcare (HIPAA), financial (SEC/FINRA), tax (IRS), employment, custom
- [x] Retention policy engine with auto-archival and expiry notifications

### Enterprise
- [x] SSO / SAML 2.0 and OpenID Connect for enterprise signer authentication
- [x] Multi-tenant architecture with organization isolation
- [x] Plan tiers — free, pro, enterprise
- [x] API key management per organization
- [x] Encrypted document storage (AES-256-GCM) with KMS support

### Integrations
- [x] Slack — signing notifications and status updates
- [x] Microsoft 365 / SharePoint — auto-upload completed documents
- [x] Google Drive — auto-upload completed documents
- [x] Box — auto-upload completed documents
- [x] Egnyte — auto-upload completed documents
- [x] Jira — ticket creation and document attachment on milestones

### Developer Experience
- [x] Full REST API with OpenAPI documentation
- [x] TypeScript SDK (`@coseal/sdk`) for Node.js and browsers
- [x] Embeddable signing iframe for custom applications
- [x] Helm chart for Kubernetes deployment
- [x] Terraform modules for AWS and GCP
- [x] Mobile-responsive signing UI (iOS Safari, Android Chrome, iPad)
- [x] Progressive Web App (PWA) support — "Add to Home Screen"
- [x] GitHub Actions CI/CD pipeline

---

## Hosted Instance

Don't want to self-host? We offer a managed CoSeal instance at **coseal.io** with three plan tiers:

### Free Plan
- 5 envelopes/month
- Email verification (Simple Electronic Signatures)
- Community support
- Perfect for: Personal use, side projects, trying out CoSeal

### Pro Plan ($49/month)
- 100 envelopes/month
- Advanced verification (2FA, government ID)
- All integrations (Slack, Box, Egnyte, M365, Google Drive, Jira)
- Custom retention policies
- Email support
- Perfect for: Small teams, startups, growing businesses

### Enterprise Plan (Custom pricing)
- Unlimited envelopes
- Qualified Electronic Signatures (QES) via Trust Service Providers
- Enterprise SSO (SAML, OIDC)
- Custom SLA and priority support
- Dedicated account manager
- Perfect for: Regulated industries, large enterprises, high-volume use

**Self-hosting is always free.** The hosted instance is for teams that want zero-config deployment.

---

## Contributing

CoSeal is open source under the [Apache 2.0 License](LICENSE). We welcome contributions of all kinds.

**Good first issues:**
- Signing UI components (React)
- PDF field placement drag-and-drop
- Email notification templates
- Documentation and guides
- Docker configuration improvements

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and development guidelines.

---

## FAQ

**Is this actually legal?**
Yes. The ESIGN Act and UETA don't require any specific technology or vendor for electronic signatures. What matters is intent, consent, association, and retention. CoSeal satisfies all of these, with cryptographic proof on top.

**Do I need the Cowork Legal plugin to use CoSeal?**
No. CoSeal works as a standalone Cowork plugin. But it's designed to work seamlessly with the Legal plugin — the two together give you the full contract lifecycle from review to execution.

**Can I use CoSeal without Cowork?**
Yes. The signing service has its own API. You can integrate it into any application. The Cowork plugin is just one interface.

**How is this different from other open-source e-signature tools?**
CoSeal is purpose-built as a Cowork plugin. It's the only signing solution that integrates directly into the AI-powered contract review workflow that the Legal plugin provides. Other tools require you to leave your AI workspace, upload documents to a separate platform, and manage a parallel process. CoSeal keeps everything in one flow.

**What about HIPAA / SOC 2 / FedRAMP?**
Since CoSeal is self-hosted, your compliance posture depends on your infrastructure. Run it on HIPAA-eligible AWS services and you inherit those controls. We provide configuration guides for common compliance frameworks.

---

## License

Apache 2.0 — use it, modify it, build on it, commercially or otherwise.

---

<p align="center">
  <strong>CoSeal is the missing piece.</strong><br/>
  Cowork Legal reviews it. CoSeal seals it.<br/><br/>
  <a href="ARCHITECTURE.md">Architecture</a> · <a href="CONTRIBUTING.md">Contributing</a> · <a href="https://github.com/coseal-sign/coseal-service/issues">Issues</a> · <a href="#hosted-instance">Hosted Plans</a>
</p>
