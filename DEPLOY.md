# Deploying SendSign

This guide covers deploying SendSign to production using Railway (recommended) or Fly.io (alternative).

---

## Railway (Recommended)

Railway is the simplest deployment path — it supports Docker, has managed PostgreSQL, and handles SSL automatically.

### Prerequisites
- GitHub account with your SendSign repository
- Railway account (free tier available)
- Stripe account (for $29/mo managed plan)

### Step-by-Step Deployment

#### 1. Create a Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your SendSign repository
5. Railway will detect the Dockerfile automatically

#### 2. Add PostgreSQL Service

1. In your Railway project, click "+ New"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically set the `DATABASE_URL` environment variable

#### 3. Configure Environment Variables

In the Railway project settings, add these environment variables:

**Required:**

```bash
# Database (auto-set by Railway when you link PostgreSQL)
DATABASE_URL=postgresql://... # Set automatically

# Application URLs
SENDSIGN_BASE_URL=https://your-app.up.railway.app
SENDSIGN_BASE_DOMAIN=your-app.up.railway.app
# After custom domain: https://sendsign.dev and sendsign.dev

# Control Plane Auth (generate a secure key)
SENDSIGN_CONTROL_API_KEY=$(openssl rand -hex 32)

# Node Environment
NODE_ENV=production

# JWT & Encryption (generate secure keys)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

**For Stripe Payments ($29/mo plan):**

1. Create a product in [Stripe Dashboard](https://dashboard.stripe.com):
   - Name: "SendSign Managed"
   - Price: $29.00 USD / month (recurring)
   - Copy the price ID (starts with `price_`)

2. Get API keys from Stripe Dashboard → Developers → API keys

3. Add to Railway:
```bash
STRIPE_SECRET_KEY=sk_live_... # Use sk_test_... for testing
STRIPE_PRICE_ID=price_...
```

4. Set up Stripe webhook (after first deployment):
   - Go to Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://your-app.up.railway.app/api/billing/webhook`
   - Select events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`
   - Copy the signing secret

5. Add webhook secret to Railway:
```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

**For Email Notifications (Recommended):**

Using SendGrid:
```bash
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_FROM_EMAIL=noreply@sendsign.dev
SENDGRID_FROM_NAME=SendSign
```

Or using SMTP:
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your_sendgrid_api_key
EMAIL_FROM=noreply@sendsign.dev
```

#### 4. Deploy

1. Railway will automatically build and deploy from your Dockerfile
2. Watch the deployment logs in the Railway dashboard
3. Once deployed, you'll get a URL like `https://your-app.up.railway.app`

#### 5. Verify Deployment

```bash
# Check health endpoint
curl https://your-app.up.railway.app/health

# Test control plane (use your SENDSIGN_CONTROL_API_KEY)
curl https://your-app.up.railway.app/control/tenants \
  -H "x-control-key: YOUR_CONTROL_KEY"
```

#### 6. Add Custom Domain (Optional)

1. In Railway project settings, go to "Settings" → "Domains"
2. Click "Add Custom Domain"
3. Enter your domain: `sendsign.dev`
4. Railway will provide DNS instructions (CNAME record)
5. Add the CNAME record in your DNS provider
6. Update environment variables with custom domain
7. Update Stripe webhook URL to use custom domain

---

## Fly.io (Alternative)

Fly.io is a good alternative with more control over infrastructure.

### Prerequisites
- [flyctl CLI](https://fly.io/docs/hands-on/install-flyctl/) installed
- Fly.io account

### Step-by-Step Deployment

#### 1. Install Fly CLI

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh
```

#### 2. Launch the App

```bash
fly auth login
fly launch  # Detects Dockerfile and fly.toml
```

#### 3. Create PostgreSQL Database

```bash
fly postgres create  # Name: sendsign-db
fly postgres attach sendsign-db --app sendsign
```

#### 4. Set Secrets

```bash
fly secrets set \
  SENDSIGN_CONTROL_API_KEY=$(openssl rand -hex 32) \
  JWT_SECRET=$(openssl rand -hex 32) \
  ENCRYPTION_KEY=$(openssl rand -hex 32) \
  NODE_ENV=production \
  SENDSIGN_BASE_URL=https://sendsign.fly.dev \
  SENDSIGN_BASE_DOMAIN=sendsign.fly.dev \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_PRICE_ID=price_...
```

#### 5. Deploy

```bash
fly deploy
fly logs  # Watch deployment
```

#### 6. Add Custom Domain

```bash
fly certs add sendsign.dev
# Follow DNS instructions
```

---

## Environment Variables Reference

### Required for All Deployments

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `NODE_ENV` | Node environment | `production` |
| `SENDSIGN_BASE_URL` | Full base URL | `https://sendsign.dev` |
| `SENDSIGN_BASE_DOMAIN` | Domain only | `sendsign.dev` |
| `SENDSIGN_CONTROL_API_KEY` | Control plane auth key | Generate with `openssl rand -hex 32` |
| `JWT_SECRET` | JWT signing secret | Generate with `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Document encryption key | Generate with `openssl rand -hex 32` |

### Stripe (For $29/mo Managed Plan)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `STRIPE_SECRET_KEY` | Stripe API key | Dashboard → Developers → API keys |
| `STRIPE_PRICE_ID` | Product price ID | Dashboard → Products |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | Dashboard → Developers → Webhooks |

### Email (Recommended)

| Variable | Description | Example |
|----------|-------------|---------|
| `SENDGRID_API_KEY` | SendGrid API key | `SG.xxxxx` |
| `SENDGRID_FROM_EMAIL` | Sender email | `noreply@sendsign.dev` |
| `SENDGRID_FROM_NAME` | Sender name | `SendSign` |

---

## Post-Deployment Checklist

- [ ] Health endpoint responds (`/health`)
- [ ] Control plane accessible with API key
- [ ] Create test tenant via control plane
- [ ] Test Stripe checkout flow
- [ ] Verify Stripe webhook endpoint
- [ ] Test plugin download
- [ ] Send test envelope via API
- [ ] Verify email notifications work
- [ ] Set up monitoring (Sentry, uptime checks)
- [ ] Configure custom domain DNS
- [ ] Update Stripe webhook URL
- [ ] Test end-to-end signing flow

---

## Troubleshooting

### Database Connection Issues
- Check `DATABASE_URL` is set correctly
- Verify database service is running
- Check connection logs

### Migrations Not Running
Check startup logs for migration errors:
```bash
# Railway: View logs in dashboard
# Fly.io: fly logs
```

### Stripe Webhook Failures
1. Verify `STRIPE_WEBHOOK_SECRET` is correct
2. Test locally first with Stripe CLI
3. Check Stripe dashboard for delivery attempts

### Health Check Timeout
1. Increase timeout in config
2. Verify `/health` responds quickly
3. Check database connection doesn't block startup

---

## Scaling

### Vertical Scaling
```bash
# Fly.io
fly scale vm shared-cpu-2x --memory 2048
```

### Horizontal Scaling
```bash
# Fly.io
fly scale count 3
fly autoscale set min=1 max=3
```

---

## Backup Strategy

**Railway:** Automatic daily backups included

**Fly.io:**
```bash
fly postgres backup create -a sendsign-db
fly postgres backup list -a sendsign-db
```

---

## Support

- **GitHub Issues:** https://github.com/sendsign/sendsign/issues
- **Email:** hello@sendsign.dev
- **Railway Support:** https://railway.app/help
- **Fly.io Community:** https://community.fly.io

---

**Deployment complete! 🚀**
