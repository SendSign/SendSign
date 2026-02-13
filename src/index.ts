import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initConfig } from './config/index.js';
import { getDb, closeDb } from './db/connection.js';
import { apiRateLimiter, signingRateLimiter } from './api/middleware/rateLimit.js';
import { authenticate } from './api/middleware/auth.js';
import { tenantContext } from './api/middleware/tenantContext.js';
import { csrfProtection, csrfTokenHandler } from './api/middleware/csrf.js';
import { scheduleReminders } from './workflow/reminderScheduler.js';
import { scheduleExpiryCheck } from './workflow/expiryManager.js';
import { scheduleRetentionProcessing } from './workflow/retentionScheduler.js';

// Route imports
import healthRoutes from './api/routes/health.js';
import envelopeRoutes from './api/routes/envelopes.js';
import signingRoutes from './api/routes/signing.js';
import templateRoutes from './api/routes/templates.js';
import webhookRoutes from './api/routes/webhooks.js';
import adminRoutes from './api/routes/admin.js';
import ssoRoutes from './api/routes/sso.js';
import retentionRoutes from './api/routes/retention.js';
import integrationsRoutes from './api/routes/integrations.js';
import organizationsRoutes from './api/routes/organizations.js';
import authRoutes from './api/routes/auth.js';
import complianceRoutes from './api/routes/compliance.js';
import pluginRoutes from './api/routes/plugin.js';
import billingRoutes, { billingWebhookRouter } from './api/routes/billing.js';

// Control plane imports
import { controlAuth } from './control/middleware/controlAuth.js';
import controlTenantRoutes from './control/routes/tenants.js';
import controlHealthRoutes from './control/routes/health.js';
import controlBillingRoutes from './control/routes/billing.js';

// ─── Initialize Configuration ────────────────────────────────────────

const config = initConfig();

// Log DATABASE_URL with password redacted for debugging
const dbUrl = config.databaseUrl;
const redactedUrl = dbUrl.replace(/:([^@]+)@/, ':****@');
console.log('✓ Configuration validated');
console.log(`✓ Database: ${redactedUrl}`);

// ─── Initialize Express App ──────────────────────────────────────────

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow PDF.js workers
}));
app.use(cors({
  origin: [
    // Salesforce domains (Step 31)
    /\.force\.com$/,
    /\.salesforce\.com$/,
    /\.lightning\.force\.com$/,
    // Allow any configured origins
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
    // Development
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  credentials: true,
}));
app.use(cookieParser());

// Stripe webhook needs raw body for signature verification — mount BEFORE json parser
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookRouter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CSRF protection (skips Bearer token requests — only applies to cookie-based sessions)
app.use(csrfProtection);

// Health check (no auth required)
app.use(healthRoutes);

// Control plane health (no auth for basic checks, controlAuth for detailed)
app.use('/health', controlHealthRoutes);

// Control plane API (master key auth — bypasses RLS)
app.use('/control', controlAuth, controlTenantRoutes);
app.use('/control', controlBillingRoutes); // Billing webhooks have their own auth (Stripe signature)

// Plugin download (info is public, download requires API key in query/header)
app.use('/api/plugin', apiRateLimiter, pluginRoutes);

// Billing (checkout is public, portal requires auth, success is public)
app.use('/api/billing', apiRateLimiter, billingRoutes);

// Auth routes (no auth required — this IS the auth)
app.use('/api/auth', apiRateLimiter, authRoutes);
app.get('/api/auth/csrf-token', csrfTokenHandler);

// Signing ceremony routes (token auth, rate limited)
// Mount at both /api/sign and /api/signing for compatibility
app.use('/api/sign', signingRateLimiter, signingRoutes);
app.use('/api/signing', signingRateLimiter, signingRoutes);

// API routes (require API key auth + tenant context, rate limited)
app.use('/api/envelopes', apiRateLimiter, authenticate, tenantContext, envelopeRoutes);
app.use('/api/templates', apiRateLimiter, authenticate, tenantContext, templateRoutes);
app.use('/api/webhooks', apiRateLimiter, authenticate, tenantContext, webhookRoutes);
app.use('/api/admin', apiRateLimiter, authenticate, tenantContext, adminRoutes);
app.use('/api/sso', apiRateLimiter, authenticate, tenantContext, ssoRoutes);
app.use('/api/retention', apiRateLimiter, authenticate, tenantContext, retentionRoutes);
app.use('/api/integrations', apiRateLimiter, authenticate, tenantContext, integrationsRoutes);
app.use('/api/organizations', apiRateLimiter, authenticate, tenantContext, organizationsRoutes);
app.use('/api/compliance', apiRateLimiter, authenticate, tenantContext, complianceRoutes);

// ─── Serve Frontend (Marketing + Signing UI) ────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const signingUiPath = path.resolve(__dirname, '../signing-ui/dist');
const marketingPath = path.resolve(__dirname, '../marketing');

// Log resolved paths for debugging
console.log('Signing UI path:', signingUiPath, '| Exists:', fs.existsSync(signingUiPath));
console.log('Marketing path:', marketingPath, '| Exists:', fs.existsSync(marketingPath));

// Billing success/cancel pages — redirect to API billing routes
app.get('/billing/success', (req, res) => {
  const sessionId = req.query.session_id;
  res.redirect(`/api/billing/success?session_id=${sessionId}`);
});
app.get('/billing/cancel', (_req, res) => {
  res.redirect('/');
});

// Serve static assets from signing-ui (CSS, JS, images, manifest.json)
// These need to be accessible from all signing UI routes
if (fs.existsSync(signingUiPath)) {
  app.use('/assets', express.static(path.join(signingUiPath, 'assets'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
  }));
  
  // Serve other static files (manifest.json, service worker, etc.)
  app.use(express.static(signingUiPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    index: false, // Don't serve index.html automatically
  }));
}

// ─── Route: Marketing Landing Page ──────────────────────────────────

// Root path serves the marketing landing page
app.get('/', (req, res) => {
  const marketingIndex = path.join(marketingPath, 'index.html');
  if (fs.existsSync(marketingIndex)) {
    res.sendFile(marketingIndex);
  } else {
    res.status(503).json({
      success: false,
      error: 'Marketing page not available',
      message: 'The landing page is not built. Try /app for the signing dashboard.',
    });
  }
});

// ─── Route: Signing UI (React SPA) ──────────────────────────────────

// Signing ceremony, field placement, and dashboard routes serve the React app
const signingUiRoutes = [
  '/app',
  '/app/*',
  '/dashboard',
  '/dashboard/*',
  '/login',
  '/register',
  '/sign/*',
  '/prepare/*',
  '/verify',
  '/complete',
  '/expired',
  '/in-person/*',
  '/powerform/*',
  '/admin',
  '/admin/*',
  '/profile',
  '/privacy',
  '/terms',
];

if (fs.existsSync(signingUiPath)) {
  const signingUiIndex = path.join(signingUiPath, 'index.html');
  
  for (const route of signingUiRoutes) {
    app.get(route, (req, res) => {
      res.sendFile(signingUiIndex);
    });
  }
} else {
  console.warn('⚠️  Signing UI not found at', signingUiPath);
  
  for (const route of signingUiRoutes) {
    app.get(route, (req, res) => {
      res.status(503).json({
        success: false,
        error: 'Signing UI not available',
        message: 'The signing UI is not built. API routes are still available at /api/*',
      });
    });
  }
}

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// ─── Start Server (only if not in test mode) ────────────────────────

let server: ReturnType<typeof app.listen> | undefined;

if (process.env.NODE_ENV !== 'test') {
  const PORT = config.port;

  server = app.listen(PORT, () => {
    console.log(`✓ SendSign API listening on port ${PORT}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Base URL: ${config.baseUrl}`);

    // Test database connection
    try {
      getDb();
      console.log('✓ Database connection established');
    } catch (error) {
      console.error('✗ Database connection failed:', error);
      process.exit(1);
    }

    // Start cron jobs
    scheduleReminders();
    scheduleExpiryCheck();
    scheduleRetentionProcessing();
    console.log('✓ Cron jobs started (reminders, expiry checks, retention processing)');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n✗ Port ${PORT} is already in use.`);
      console.error(`  Kill the other process:  lsof -ti :${PORT} | xargs kill -9`);
      console.error(`  Or use a different port:  PORT=3001 npm run dev\n`);
    } else {
      console.error('✗ Server error:', err);
    }
    process.exit(1);
  });

  // ─── Graceful Shutdown ───────────────────────────────────────────────

  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    if (server) {
      server.close(async () => {
        console.log('✓ HTTP server closed');

        try {
          await closeDb();
          console.log('✓ Database connection closed');
        } catch (error) {
          console.error('Error closing database:', error);
        }

        process.exit(0);
      });
    }

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Export for testing
export { app };
