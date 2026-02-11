import { getDb } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';

async function migrate() {
  const db = getDb();

  const statements = [
    // User account lockout fields
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ',
    // User GDPR/privacy fields
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS gdpr_consent_at TIMESTAMPTZ',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS gdpr_consent_version TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS ccpa_opt_out BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_policy_version TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS data_export_requested_at TIMESTAMPTZ',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS erasure_requested_at TIMESTAMPTZ',
    // Audit chain fields
    'ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS event_hash TEXT',
    'ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS previous_hash TEXT',
  ];

  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt));
      console.log(`  ✓ ${stmt.split('ADD COLUMN IF NOT EXISTS ')[1]?.split(' ')[0] || stmt.substring(0, 50)}`);
    } catch (e: unknown) {
      const err = e as Error;
      if (!err.message?.includes('already exists')) {
        console.error(`  ✗ ${stmt}: ${err.message}`);
      } else {
        console.log(`  - Already exists: ${stmt.split('ADD COLUMN IF NOT EXISTS ')[1]?.split(' ')[0]}`);
      }
    }
  }

  console.log('\n✓ Compliance migration complete');
  process.exit(0);
}

migrate();
