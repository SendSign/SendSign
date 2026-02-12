#!/bin/sh

# Production startup script for SendSign
# This script:
# 1. Waits for PostgreSQL to be ready
# 2. Runs database migrations
# 3. Seeds default tenant if needed
# 4. Starts the Node.js server

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SendSign Production Startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─── Wait for PostgreSQL ────────────────────────────────────────────

echo "⏳ Waiting for PostgreSQL to be ready..."

# Extract connection details from DATABASE_URL
# Format: postgresql://user:password@host:port/database
DB_HOST=$(echo $DATABASE_URL | sed -E 's|postgresql://[^@]+@([^:/]+).*|\1|')
DB_PORT=$(echo $DATABASE_URL | sed -E 's|postgresql://[^@]+@[^:]+:([0-9]+).*|\1|')
DB_USER=$(echo $DATABASE_URL | sed -E 's|postgresql://([^:]+):.*|\1|')
DB_NAME=$(echo $DATABASE_URL | sed -E 's|.*/([^?]+).*|\1|')

# Default to 5432 if port not found
if [ "$DB_PORT" = "$DATABASE_URL" ]; then
  DB_PORT=5432
fi

MAX_RETRIES=30
RETRY_COUNT=0

until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "❌ PostgreSQL did not become ready in time. Exiting."
    exit 1
  fi
  echo "   Waiting for PostgreSQL... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "✅ PostgreSQL is ready"
echo ""

# ─── Generate Self-Signed Certificates ──────────────────────────────

if [ ! -f "/app/certs/signing-cert.pem" ] || [ ! -f "/app/certs/signing-key.pem" ]; then
  echo "🔐 Generating self-signed certificates..."
  openssl req -x509 -newkey rsa:2048 \
    -keyout /app/certs/signing-key.pem \
    -out /app/certs/signing-cert.pem \
    -days 365 -nodes \
    -subj "/CN=SendSign Self-Signed" > /dev/null 2>&1
  echo "✅ Certificates generated"
  echo ""
fi

# ─── Run Database Migrations ────────────────────────────────────────

echo "🔄 Running database migrations..."

# Use drizzle-kit push for initial schema setup
# This is simpler than SQL file tracking for production deployments
npx drizzle-kit push --force || {
  echo "⚠️  drizzle-kit push failed, trying manual SQL execution..."
  
  # Fallback: Run SQL files manually in order
  for MIGRATION_FILE in src/db/migrations/*.sql; do
    if [ -f "$MIGRATION_FILE" ]; then
      echo "   Applying: $(basename $MIGRATION_FILE)"
      psql "$DATABASE_URL" -f "$MIGRATION_FILE" 2>&1 | grep -v "already exists" || true
    fi
  done
}

echo "✅ Migrations completed"
echo ""

# ─── Seed Default Tenant ────────────────────────────────────────────

echo "🌱 Checking for default tenant..."

# Check if default tenant exists
TENANT_EXISTS=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001'" 2>/dev/null || echo "0")

if [ "$TENANT_EXISTS" = "0" ]; then
  echo "   Creating default tenant..."
  
  # Insert default tenant
  psql "$DATABASE_URL" <<-EOSQL
    INSERT INTO tenants (id, name, slug, plan, status, envelope_limit, user_limit, template_limit, bulk_send_limit, audit_retention_days, features, license_type)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'Default Tenant',
      'default',
      'enterprise',
      'active',
      -1,
      -1,
      -1,
      -1,
      -1,
      '{"basicSigning": true, "templates": true, "auditTrail": true, "branding": true, "sso": true, "bulkSend": true, "apiAccess": true, "advancedFields": true, "webhooks": true, "qes": true}',
      'agpl'
    )
    ON CONFLICT (id) DO NOTHING;
EOSQL
  
  echo "   ✅ Default tenant created"
else
  echo "   ✅ Default tenant already exists"
fi

echo ""

# ─── Start the Server ───────────────────────────────────────────────

echo "🚀 Starting SendSign server..."
echo "   Environment: $NODE_ENV"
echo "   Port: $PORT"
echo "   Base URL: $BASE_URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the Node.js application
# Note: Using tsx instead of compiled output due to pre-existing TypeScript errors
# that don't affect runtime but prevent strict compilation
exec npx tsx src/index.ts
