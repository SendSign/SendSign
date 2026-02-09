# CoSeal Development Context

## What This Is
CoSeal is an open-source e-signature engine + Claude Cowork plugin. It's the missing piece that completes the contract lifecycle started by Anthropic's Legal plugin. Review → Redline → Sign → Seal — all without leaving Claude.

## Key Documents
- `README.md` — Project positioning, feature overview, comparison to DocuSign, roadmap
- `ARCHITECTURE.md` — Full technical spec: plugin structure, service architecture, database schema, API endpoints, signing ceremony flow, crypto sealing, security model
- `BUILD_RECIPE.md` — **THE BUILD PLAN. Follow this file step by step.**

## Tech Stack
- **Runtime:** Node.js 20+ / TypeScript 5+
- **API:** Express.js
- **Database:** PostgreSQL 16 + Drizzle ORM
- **PDF:** pdf-lib (manipulation), PDF.js (browser rendering)
- **Crypto:** node-forge (X.509, SHA-256, PDF digital signatures)
- **Signing UI:** React 18 + Vite + Tailwind CSS
- **Storage:** S3-compatible (AWS S3, MinIO, Backblaze)
- **Notifications:** SendGrid (email), Twilio (SMS)
- **Identity Verification:** Twilio Verify (OTP), Jumio/Onfido (government ID)
- **SSO:** @node-saml/passport-saml (SAML 2.0), openid-client (OIDC)
- **QES:** Swisscom AIS, Namirial (Trust Service Providers)
- **Validation:** zod
- **Testing:** vitest
- **Deployment:** Docker + docker-compose, Helm (K8s), Terraform (AWS/GCP)
- **SDK:** tsup (dual CJS/ESM build), published as @coseal/sdk
- **ORM Migrations:** Drizzle Kit

## Key Principles
1. **Every action creates an immutable audit event** — no exceptions
2. **Documents are encrypted at rest** with AES-256-GCM
3. **Signing tokens are single-use and time-limited** (default 72hr)
4. **Sealed PDFs must be independently verifiable** without CoSeal running
5. **The service works standalone** — Cowork plugin is one interface, REST API is another
6. **No vendor lock-in** — S3-compatible storage, standard SMTP fallback, self-hosted by default

## Code Style
- Strict TypeScript — no `any` types
- Async/await everywhere, no raw callbacks
- All API endpoints return consistent JSON: `{ success: boolean, data?: T, error?: string }`
- All database operations go through Drizzle ORM — no raw SQL in application code
- Every module has a corresponding `.test.ts` file
- Use named exports, not default exports
- Environment variables validated at startup with zod — fail fast if missing

## Directory Conventions
- `src/api/routes/` — Express route handlers (thin — delegate to service layer)
- `src/*/` — Domain modules (documents, workflow, ceremony, crypto, audit, storage, notifications)
- Each domain module has an `index.ts` that exports its public interface
- `signing-ui/` — Separate React app, built and served as static files
- `deploy/` — Helm charts, Terraform, deployment configs

## Current Phase
Follow BUILD_RECIPE.md from Step 1 through Step 23. Update this line as you complete each step:
**STATUS: 🚀 Steps 24-28 complete — RBAC, Collaborative Commenting, Delegation, Locked Templates, Folders, Delayed Routing**

### Completed Steps:
- ✅ Steps 1-3: Project scaffold, database, audit logger
- ✅ Step 4: Encrypted storage with S3
- ✅ Step 5: PDF processing and field placement
- ✅ Step 6: Crypto sealing with certificates
- ✅ Step 7: Workflow engine (signing order, reminders, expiry)
- ✅ Step 8: Notifications (email, SMS, WhatsApp, webhooks)
- ✅ Step 9: REST API with authentication and rate limiting
- ✅ Step 10: Signing UI (React + Vite + Tailwind)
- ✅ Step 11: E2E integration test
- ✅ Step 12: Cowork plugin (commands, skills, MCP)
- ✅ Step 13: Docker production build + setup script
- ✅ Step 14: Full documentation + admin dashboard
- ✅ Step 15: Launch prep (badges, changelog, CI, GitHub templates)
- ✅ Step 16: eIDAS AES — two-factor, government ID verification, identity evidence in sealing/certs
- ✅ Step 17: QES — Swisscom AIS + Namirial TSP adapters, full mock flow, compliance docs
- ✅ Step 18: Enterprise SSO — SAML 2.0 + OIDC, multi-tenant config, IdP integration, SSO = AES-level verification
- ✅ Step 19: Retention policy engine — Industry presets (HIPAA, SEC, IRS, GDPR), auto-delete/flagged review, cron job, compliance docs
- ✅ Step 20: Mobile-responsive signing + @coseal/sdk — PWA, touch-optimized, bottom-sheet nav, embeddable SDK with tsup build
