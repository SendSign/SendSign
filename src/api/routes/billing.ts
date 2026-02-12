import { Router, Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { getDb } from '../../db/connection.js';
import { tenants, users, apiKeys, organizations } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { tenantContext, getTenant } from '../middleware/tenantContext.js';
import crypto from 'node:crypto';

const router = Router();

// Separate router for webhook (needs raw body middleware)
export const billingWebhookRouter = Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout session for the $29/mo managed plan.
 * No authentication required — this is the signup flow.
 *
 * Body: { email: string, tenantSlug: string }
 */
router.post('/checkout', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, tenantSlug } = req.body;

    if (!email || !tenantSlug) {
      res.status(400).json({
        success: false,
        error: 'email and tenantSlug are required',
      });
      return;
    }

    // Basic slug validation
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(tenantSlug) || tenantSlug.length < 3 || tenantSlug.length > 50) {
      res.status(400).json({
        success: false,
        error: 'Invalid tenant slug. Must be 3-50 lowercase alphanumeric characters with hyphens.',
      });
      return;
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId || priceId === 'price_placeholder') {
      res.status(500).json({
        success: false,
        error: 'Stripe not configured. Set STRIPE_PRICE_ID in environment.',
      });
      return;
    }

    const baseUrl = process.env.BASE_URL || process.env.SENDSIGN_BASE_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing/cancel`,
      metadata: {
        tenantSlug,
        adminEmail: email,
        plan: 'managed',
      },
    });

    res.json({
      success: true,
      data: {
        url: session.url,
        sessionId: session.id,
      },
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({
        success: false,
      error: 'Failed to create checkout session',
    });
  }
});

/**
 * POST /webhook
 *
 * Handles Stripe webhook events.
 * This endpoint MUST use express.raw() for the body — NOT json parsing.
 * Mounted separately in src/index.ts with raw body middleware at /api/billing/webhook.
 *
 * Events handled:
 *   - checkout.session.completed: Provision new managed tenant
 *   - customer.subscription.deleted: Cancel tenant
 *   - invoice.payment_failed: Mark tenant as past_due
 */
billingWebhookRouter.post(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sig = req.headers['stripe-signature'];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!sig || !webhookSecret || webhookSecret === 'whsec_placeholder') {
        console.error('[Stripe webhook] Missing signature or webhook secret not configured');
        res.status(400).json({ received: false, error: 'Missing signature or secret' });
      return;
    }

      // Construct and verify the event
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig as string,
        webhookSecret,
      );

      console.log(`[Stripe webhook] ${event.type}:`, event.id);

      const db = getDb();

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const { tenantSlug, adminEmail } = session.metadata || {};

          if (!tenantSlug || !adminEmail) {
            console.error('[Stripe webhook] Missing metadata in checkout session:', session.id);
            break;
          }

          console.log(`[Stripe webhook] Provisioning tenant: ${tenantSlug}`);

          // Check if tenant already exists (webhook replay protection)
          const existingTenant = await db
            .select()
            .from(tenants)
            .where(eq(tenants.slug, tenantSlug))
            .limit(1);

          if (existingTenant.length > 0) {
            console.log(`[Stripe webhook] Tenant ${tenantSlug} already exists, skipping provisioning`);
            break;
          }

          // Create the tenant with managed plan defaults
          const [tenant] = await db.insert(tenants).values({
            name: tenantSlug.charAt(0).toUpperCase() + tenantSlug.slice(1),
            slug: tenantSlug,
            plan: 'managed',
            status: 'active',
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            // Managed plan limits
            envelopeLimit: -1, // unlimited
            userLimit: 5,
            templateLimit: -1, // unlimited
            bulkSendLimit: 100,
            auditRetentionDays: 30,
            features: {
              basicSigning: true,
              templates: true,
              auditTrail: true,
              branding: false, // White-label only
              sso: false, // White-label only
              bulkSend: true,
              apiAccess: true,
              advancedFields: true,
              webhooks: true,
              qes: false, // White-label only
            },
            licenseType: 'agpl', // Managed tier still uses AGPL (no commercial license)
          }).returning();

          // Create default organization
          const [org] = await db.insert(organizations).values({
            name: `${tenant.name} Organization`,
            tenantId: tenant.id,
          }).returning();

          // Create admin user
          const [adminUser] = await db.insert(users).values({
            email: adminEmail,
            name: adminEmail.split('@')[0], // Use email prefix as name
            role: 'admin',
            tenantId: tenant.id,
            organizationId: org.id,
          }).returning();

          // Generate API key
          const apiKeyPrefix = 'ss_live_';
          const apiKeySecret = crypto.randomBytes(32).toString('hex');
          const fullApiKey = `${apiKeyPrefix}${apiKeySecret}`;
          const keyHash = crypto.createHash('sha256').update(fullApiKey).digest('hex');

          await db.insert(apiKeys).values({
            organizationId: org.id,
            keyHash,
            name: 'Default API Key',
            permissions: ['all'],
            tenantId: tenant.id,
          });

          console.log(`[Stripe webhook] Tenant provisioned: ${tenant.slug} (${tenant.id})`);
          console.log(`[Stripe webhook] Admin user: ${adminUser.email} (${adminUser.id})`);
          console.log(`[Stripe webhook] API key generated: ${apiKeyPrefix}${'*'.repeat(apiKeySecret.length)}`);

          // TODO: Send welcome email with API key and Cowork plugin download link
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;

          // Find tenant by Stripe customer ID
          const [tenant] = await db
            .select()
            .from(tenants)
            .where(eq(tenants.stripeCustomerId, customerId))
            .limit(1);

          if (tenant) {
            await db
              .update(tenants)
              .set({
                status: 'canceled',
                canceledAt: new Date(),
              })
              .where(eq(tenants.id, tenant.id));

            console.log(`[Stripe webhook] Tenant canceled: ${tenant.slug}`);
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          // Find tenant by Stripe customer ID
          const [tenant] = await db
            .select()
            .from(tenants)
            .where(eq(tenants.stripeCustomerId, customerId))
            .limit(1);

          if (tenant) {
            // Mark as past_due
            // After 7 days past_due without payment, tenant should be suspended
            // (This could be handled by a cron job or another webhook event)
            await db
              .update(tenants)
              .set({ status: 'past_due' })
              .where(eq(tenants.id, tenant.id));

            console.log(`[Stripe webhook] Tenant payment failed: ${tenant.slug} (marked past_due)`);
            // TODO: Send payment failure email
          }
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          // Find tenant by Stripe customer ID
          const [tenant] = await db
            .select()
            .from(tenants)
            .where(eq(tenants.stripeCustomerId, customerId))
            .limit(1);

          if (tenant && tenant.status === 'past_due') {
            // Reactivate tenant
            await db
              .update(tenants)
              .set({ status: 'active' })
              .where(eq(tenants.id, tenant.id));

            console.log(`[Stripe webhook] Tenant reactivated after payment: ${tenant.slug}`);
          }
          break;
        }

        default:
          console.log(`[Stripe webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[Stripe webhook] Error processing webhook:', error);
      res.status(400).json({
        received: false,
        error: error instanceof Error ? error.message : 'Webhook processing failed',
      });
    }
  },
);

/**
 * GET /api/billing/portal
 *
 * Creates a Stripe billing portal session for managing subscription.
 * Requires authentication + tenant context.
 */
router.get('/portal', authenticate, tenantContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenant = getTenant(req);

    if (!tenant) {
      res.status(401).json({
        success: false,
        error: 'Tenant context required',
      });
      return;
    }

    if (!tenant.stripeCustomerId) {
      res.status(400).json({
        success: false,
        error: 'No Stripe subscription found for this tenant',
      });
      return;
    }

    const baseUrl = process.env.BASE_URL || process.env.SENDSIGN_BASE_URL || 'http://localhost:3000';

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${baseUrl}/dashboard`,
    });

    res.json({
      success: true,
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    console.error('Billing portal error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create billing portal session',
    });
  }
});

/**
 * GET /api/billing/success
 *
 * Success page after Stripe checkout completion.
 * Retrieves the checkout session and displays API key + Cowork plugin download link.
 *
 * Query param: session_id (from Stripe)
 */
router.get('/success', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.query.session_id as string;

    if (!sessionId) {
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
<head>
          <title>Error - SendSign</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
            body { font-family: system-ui, sans-serif; max-width: 600px; margin: 100px auto; padding: 20px; }
            h1 { color: #dc2626; }
          </style>
        </head>
        <body>
          <h1>Error</h1>
          <p>Missing session_id parameter. This link may be invalid.</p>
          <a href="/">Return to home</a>
        </body>
        </html>
      `);
      return;
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payment Pending - SendSign</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; max-width: 600px; margin: 100px auto; padding: 20px; }
          </style>
        </head>
        <body>
          <h1>Payment Pending</h1>
          <p>Your payment is being processed. Please check back in a few minutes.</p>
          <a href="/">Return to home</a>
        </body>
        </html>
      `);
      return;
    }

    const { tenantSlug, adminEmail } = session.metadata || {};

    if (!tenantSlug) {
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error - SendSign</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; max-width: 600px; margin: 100px auto; padding: 20px; }
          </style>
        </head>
        <body>
          <h1>Error</h1>
          <p>Session metadata is missing. Please contact support.</p>
        </body>
        </html>
      `);
      return;
    }

    // Find the newly created tenant
    const db = getDb();
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Processing - SendSign</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center; }
            .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #2563eb; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <h1>Setting Up Your Account...</h1>
          <div class="spinner"></div>
          <p>Your payment was successful! We're setting up your SendSign account.</p>
          <p>This page will automatically refresh in 5 seconds...</p>
          <script>setTimeout(() => location.reload(), 5000);</script>
        </body>
        </html>
      `);
      return;
    }

    // Find the admin user's API key
    const [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.tenantId, tenant.id))
      .where(eq(users.role, 'admin'))
      .limit(1);

    // Get API key hash (we can't retrieve the plain key, but we can show instructions)
    const baseDomain = process.env.SENDSIGN_BASE_DOMAIN || 'sendsign.dev';
    const dashboardUrl = `https://${tenant.slug}.${baseDomain}/dashboard`;
    const pluginDownloadUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/plugin/download`;

    // Success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Welcome to SendSign!</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 700px;
            margin: 0 auto;
            padding: 40px 20px;
            background: #f8fafc;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          h1 {
            color: #1e293b;
            margin: 0 0 10px 0;
          }
          .subtitle {
            color: #64748b;
            font-size: 16px;
            margin-bottom: 30px;
          }
          .section {
            margin: 30px 0;
            padding: 20px;
            background: #f8fafc;
      border-radius: 8px;
            border-left: 4px solid #2563eb;
          }
          .section h2 {
            margin: 0 0 10px 0;
            font-size: 18px;
            color: #1e293b;
          }
          .code {
            background: #1e293b;
            color: #e2e8f0;
            padding: 12px;
            border-radius: 6px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            overflow-x: auto;
            margin: 10px 0;
          }
          .button {
            display: inline-block;
      background: #2563eb;
      color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            margin: 10px 10px 10px 0;
          }
          .button:hover {
            background: #1d4ed8;
          }
          .button.secondary {
            background: white;
            color: #2563eb;
            border: 2px solid #2563eb;
          }
          .button.secondary:hover {
      background: #eff6ff;
          }
          .success-icon {
            width: 60px;
            height: 60px;
            background: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
            margin: 0 auto 20px auto;
            color: white;
            font-size: 32px;
          }
          ol {
            padding-left: 20px;
          }
          li {
            margin: 10px 0;
            color: #475569;
          }
          .info {
            color: #475569;
            font-size: 14px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
          }
  </style>
</head>
<body>
        <div class="container">
          <div class="success-icon">✓</div>
    <h1>Welcome to SendSign!</h1>
          <p class="subtitle">Your managed instance is ready.</p>

    <div class="section">
            <h2>🎯 Getting Started</h2>
            <p>Your SendSign account is now active. Here's what to do next:</p>
            <ol>
              <li>Download the Cowork plugin below</li>
              <li>Unzip and drag the <code>.claude-plugin</code> folder into any Claude Cowork project</li>
              <li>Say: "Send this NDA to jane@acme.com for signature"</li>
              <li>That's it! Claude handles the rest.</li>
            </ol>
    </div>

    <div class="section">
            <h2>🔑 Your Account Details</h2>
            <p><strong>Tenant:</strong> ${tenant.slug}</p>
            <p><strong>Plan:</strong> Managed ($29/mo)</p>
            <p><strong>Email:</strong> ${adminEmail}</p>
            <p><strong>API Key:</strong> Check your email for your API key, or retrieve it from the dashboard.</p>
            <p class="info">
              Your API key was sent to ${adminEmail}. If you don't see it, check your spam folder.
            </p>
    </div>

    <div class="section">
            <h2>📦 Download Cowork Plugin</h2>
            <p>Download your personalized Cowork plugin. It has your API key pre-configured.</p>
            <a href="${dashboardUrl}/admin/api-keys" class="button">View API Key in Dashboard</a>
            <p class="info" style="margin-top: 15px;">
              Once you have your API key, download the plugin from:<br>
              <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                GET ${pluginDownloadUrl}?apiKey=YOUR_KEY
              </code>
      </p>
    </div>

          <div style="margin-top: 30px; text-align: center;">
            <a href="${dashboardUrl}" class="button">Go to Dashboard</a>
            <a href="https://docs.sendsign.dev" class="button secondary">View Documentation</a>
    </div>

          <div class="info" style="text-align: center; margin-top: 40px;">
            <p>Need help? Email us at <a href="mailto:support@sendsign.dev" style="color: #2563eb;">support@sendsign.dev</a></p>
    </div>
  </div>
</body>
      </html>
    `);
  } catch (error) {
    console.error('Billing success page error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error - SendSign</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, sans-serif; max-width: 600px; margin: 100px auto; padding: 20px; }
        </style>
      </head>
      <body>
        <h1>Error</h1>
        <p>Something went wrong. Please contact support@sendsign.dev</p>
      </body>
      </html>
    `);
  }
});

/**
 * GET /api/billing/cancel
 *
 * Cancel page when user abandons Stripe checkout.
 */
router.get('/cancel', (_req: Request, res: Response): void => {
  res.send(`
    <!DOCTYPE html>
    <html>
<head>
      <title>Checkout Canceled - SendSign</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 600px;
          margin: 100px auto;
          padding: 40px 20px;
      text-align: center;
    }
        h1 { color: #1e293b; }
        p { color: #64748b; font-size: 16px; line-height: 1.6; }
        .button {
      display: inline-block;
      background: #2563eb;
      color: white;
          padding: 12px 24px;
          border-radius: 6px;
      text-decoration: none;
          font-weight: 500;
          margin-top: 20px;
        }
        .button:hover {
          background: #1d4ed8;
    }
  </style>
</head>
<body>
      <h1>Checkout Canceled</h1>
      <p>No worries! You can try again anytime.</p>
      <p>SendSign is also available as a free self-hosted option if you prefer to run it yourself.</p>
      <a href="/" class="button">Return to Home</a>
      <a href="https://github.com/sendsign/sendsign" class="button" style="background: white; color: #2563eb; border: 2px solid #2563eb; margin-left: 10px;">View on GitHub</a>
</body>
    </html>
  `);
});

export default router;
