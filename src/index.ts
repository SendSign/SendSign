import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initConfig } from './config/index.js';
import { getDb, closeDb } from './db/connection.js';
import { apiRateLimiter, signingRateLimiter } from './api/middleware/rateLimit.js';
import { authenticate } from './api/middleware/auth.js';
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
app.use(helmet({ contentSecurityPolicy: false }));
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check (no auth required)
app.use(healthRoutes);

// Auth routes (no auth required — this IS the auth)
app.use('/api/auth', apiRateLimiter, authRoutes);

// Signing ceremony routes (token auth, rate limited)
// Mount at both /api/sign and /api/signing for compatibility
app.use('/api/sign', signingRateLimiter, signingRoutes);
app.use('/api/signing', signingRateLimiter, signingRoutes);

// API routes (require API key auth, rate limited)
app.use('/api/envelopes', apiRateLimiter, authenticate, envelopeRoutes);
app.use('/api/templates', apiRateLimiter, authenticate, templateRoutes);
app.use('/api/webhooks', apiRateLimiter, authenticate, webhookRoutes);
app.use('/api/admin', apiRateLimiter, authenticate, adminRoutes);
app.use('/api/sso', apiRateLimiter, authenticate, ssoRoutes);
app.use('/api/retention', apiRateLimiter, authenticate, retentionRoutes);
app.use('/api/integrations', apiRateLimiter, authenticate, integrationsRoutes);
app.use('/api/organizations', apiRateLimiter, authenticate, organizationsRoutes);

// ─── Serve Signing UI (React SPA) ───────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const signingUiPath = path.resolve(__dirname, '../signing-ui/dist');

// Serve static assets
app.use('/assets', express.static(path.join(signingUiPath, 'assets')));
app.use('/vite.svg', express.static(path.join(signingUiPath, 'vite.svg')));
app.use('/sendsign-logo.svg', express.static(path.join(signingUiPath, 'sendsign-logo.svg')));

// SPA fallback: serve index.html for signing UI routes
const spaRoutes = ['/dashboard', '/login', '/register', '/sign/*', '/prepare/*', '/verify', '/complete', '/expired', '/in-person/*', '/powerform/*', '/admin'];
for (const route of spaRoutes) {
  app.get(route, (req, res) => {
    res.sendFile(path.join(signingUiPath, 'index.html'));
  });
}

// Root route — serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(signingUiPath, 'index.html'));
});

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
    console.log(`✓ CoSeal API listening on port ${PORT}`);
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
