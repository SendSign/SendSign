import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

// Helper to read a string env var, treating empty string as undefined
function env(name: string): string | undefined {
  const val = process.env[name];
  return val !== undefined && val !== '' ? val : undefined;
}

function envInt(name: string): number | undefined {
  const val = env(name);
  if (val === undefined) return undefined;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? undefined : parsed;
}

function envBool(name: string): boolean | undefined {
  const val = env(name);
  if (val === undefined) return undefined;
  return val === 'true' || val === '1';
}

// ─── Schema ──────────────────────────────────────────────────────

const configSchema = z.object({
  // Server
  port: z.number().int().positive().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  apiKey: z.string().min(1),
  baseUrl: z.string().min(1),

  // Database
  databaseUrl: z.string().min(1),

  // Storage
  storageType: z.enum(['s3', 'local']).default('local'),
  storagePath: z.string().default('./storage'),

  // Storage (S3-compatible) - only required when storageType=s3
  s3Endpoint: z.string().optional(),
  s3Bucket: z.string().default('sendsign-documents'),
  s3AccessKey: z.string().optional(),
  s3SecretKey: z.string().optional(),
  s3Region: z.string().default('us-east-1'),

  // Encryption
  encryptionKey: z.string().min(16),

  // Signing Certificates
  signingCertPath: z.string().min(1).default('./certs/signing-cert.pem'),
  signingKeyPath: z.string().min(1).default('./certs/signing-key.pem'),

  // Email (SendGrid)
  sendgridApiKey: z.string().optional(),
  sendgridFromEmail: z.string().optional(),
  sendgridFromName: z.string().default('SendSign'),

  // Email (SMTP Fallback)
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().positive().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  smtpFrom: z.string().optional(),

  // Twilio
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioPhoneFrom: z.string().optional(),
  twilioWhatsappFrom: z.string().optional(),
  twilioVerifyServiceSid: z.string().optional(),

  // Retention
  retentionPeriodDays: z.number().int().positive().default(2555),

  // Reminders
  reminderIntervalHours: z.number().int().positive().default(48),

  // Signing
  signingTokenExpiryHours: z.number().int().positive().default(72),

  // Rate Limiting
  rateLimitWindowMs: z.number().int().positive().default(60000),
  rateLimitMaxRequests: z.number().int().positive().default(100),

  // Branding
  sendsignBrandingEntitlement: z.string().optional(),

  // Identity Verification (AES)
  jumioApiKey: z.string().optional(),
  jumioApiSecret: z.string().optional(),
  onfidoApiToken: z.string().optional(),

  // QES
  qesProvider: z.string().optional(),
  swisscomAisUrl: z.string().optional(),
  swisscomAisKey: z.string().optional(),
  swisscomAisCertPath: z.string().optional(),
  namirialApiUrl: z.string().optional(),
  namirialApiKey: z.string().optional(),

  // SSO
  ssoEnabled: z.boolean().default(false),
  ssoSpEntityId: z.string().optional(),
  ssoSpCertPath: z.string().optional(),
  ssoSpKeyPath: z.string().optional(),

  // Logging
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

// ─── Loader ──────────────────────────────────────────────────────

export function loadConfig(): Config {
  const rawConfig = {
    // Server
    port: envInt('PORT'),
    nodeEnv: env('NODE_ENV'),
    apiKey: env('API_KEY') ?? env('SENDSIGN_API_KEY'),
    baseUrl: env('BASE_URL') ?? env('SENDSIGN_BASE_URL'),

    // Database
    databaseUrl: env('DATABASE_URL'),

    // Storage
    storageType: env('STORAGE_TYPE'),
    storagePath: env('STORAGE_PATH'),
    s3Endpoint: env('S3_ENDPOINT'),
    s3Bucket: env('S3_BUCKET'),
    s3AccessKey: env('S3_ACCESS_KEY'),
    s3SecretKey: env('S3_SECRET_KEY'),
    s3Region: env('S3_REGION'),

    // Encryption
    encryptionKey: env('ENCRYPTION_KEY'),

    // Signing Certificates
    signingCertPath: env('SIGNING_CERT_PATH') ?? env('SENDSIGN_SIGNING_CERT_PATH'),
    signingKeyPath: env('SIGNING_KEY_PATH') ?? env('SENDSIGN_SIGNING_KEY_PATH'),

    // Email (SendGrid)
    sendgridApiKey: env('SENDGRID_API_KEY'),
    sendgridFromEmail: env('SENDGRID_FROM_EMAIL'),
    sendgridFromName: env('SENDGRID_FROM_NAME'),

    // Email (SMTP Fallback)
    smtpHost: env('SMTP_HOST'),
    smtpPort: envInt('SMTP_PORT'),
    smtpUser: env('SMTP_USER'),
    smtpPassword: env('SMTP_PASSWORD'),
    smtpFrom: env('SMTP_FROM'),

    // Twilio
    twilioAccountSid: env('TWILIO_ACCOUNT_SID'),
    twilioAuthToken: env('TWILIO_AUTH_TOKEN'),
    twilioPhoneFrom: env('TWILIO_PHONE_FROM'),
    twilioWhatsappFrom: env('TWILIO_WHATSAPP_FROM'),
    twilioVerifyServiceSid: env('TWILIO_VERIFY_SERVICE_SID'),

    // Retention
    retentionPeriodDays: envInt('RETENTION_PERIOD_DAYS'),

    // Reminders
    reminderIntervalHours: envInt('REMINDER_INTERVAL_HOURS'),

    // Signing
    signingTokenExpiryHours: envInt('SIGNING_TOKEN_EXPIRY_HOURS'),

    // Rate Limiting
    rateLimitWindowMs: envInt('RATE_LIMIT_WINDOW_MS'),
    rateLimitMaxRequests: envInt('RATE_LIMIT_MAX_REQUESTS'),

    // Branding
    sendsignBrandingEntitlement: env('SENDSIGN_BRANDING_ENTITLEMENT'),

    // Identity Verification (AES)
    jumioApiKey: env('JUMIO_API_KEY'),
    jumioApiSecret: env('JUMIO_API_SECRET'),
    onfidoApiToken: env('ONFIDO_API_TOKEN'),

    // QES
    qesProvider: env('QES_PROVIDER'),
    swisscomAisUrl: env('SWISSCOM_AIS_URL'),
    swisscomAisKey: env('SWISSCOM_AIS_KEY'),
    swisscomAisCertPath: env('SWISSCOM_AIS_CERT_PATH'),
    namirialApiUrl: env('NAMIRIAL_API_URL'),
    namirialApiKey: env('NAMIRIAL_API_KEY'),

    // SSO
    ssoEnabled: envBool('SSO_ENABLED'),
    ssoSpEntityId: env('SSO_SP_ENTITY_ID'),
    ssoSpCertPath: env('SSO_SP_CERT_PATH'),
    ssoSpKeyPath: env('SSO_SP_KEY_PATH'),

    // Logging
    logLevel: env('LOG_LEVEL'),
  };

  return validateConfig(rawConfig);
}

// ─── Validator ───────────────────────────────────────────────────

export function validateConfig(rawConfig: unknown): Config {
  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error('╔══════════════════════════════════════════════════╗');
    console.error('║  SendSign Configuration Error — Startup Aborted   ║');
    console.error('╚══════════════════════════════════════════════════╝');
    console.error('');
    console.error('Missing or invalid environment variables:');
    console.error(errors);
    console.error('');
    console.error('See .env.example for a complete reference.');
    process.exit(1);
  }

  const config = result.data;

  // Additional validation: if storageType=s3, require S3 credentials
  if (config.storageType === 's3') {
    if (!config.s3Endpoint || !config.s3AccessKey || !config.s3SecretKey) {
      console.error('╔══════════════════════════════════════════════════╗');
      console.error('║  SendSign Configuration Error — Startup Aborted   ║');
      console.error('╚══════════════════════════════════════════════════╝');
      console.error('');
      console.error('STORAGE_TYPE is set to "s3" but S3 credentials are missing.');
      console.error('Required: S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY');
      console.error('');
      console.error('For local development, use STORAGE_TYPE=local instead.');
      process.exit(1);
    }
  }

  return config;
}

// ─── Singleton ───────────────────────────────────────────────────
// Lazy-loaded: only validates when accessed, not at import time.
// This avoids errors in tests or seed scripts that don't need
// the full config (they can import the schema without side effects).

let _config: Config | undefined;

export const config = new Proxy({} as Config, {
  get(_target, prop: string) {
    if (!_config) {
      _config = loadConfig();
    }
    return _config[prop as keyof Config];
  },
});

/**
 * Explicitly initialise the config and return it.
 * Call this at startup for fail-fast behaviour.
 */
export function initConfig(): Config {
  _config = loadConfig();
  return _config;
}
