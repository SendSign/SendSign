-- =====================================================================
-- Migration: Add Row-Level Security (RLS) for Tenant Isolation
-- Enables RLS on all tenant-scoped tables and creates policies that
-- restrict access to rows matching the current session's tenant_id.
-- =====================================================================

-- ─── Enable RLS on all tenant-scoped tables ─────────────────────────
-- FORCE RLS ensures policies apply even to the table owner (the app's DB user).
-- This is CRITICAL for proper tenant isolation.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE envelopes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE envelopes FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE documents FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE signers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE signers FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fields FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE templates FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE folders FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE envelope_folders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE envelope_folders FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE identity_verifications FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sso_configurations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sso_configurations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE retention_policies FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE comments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE branding_config ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE branding_config FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ─── Create tenant isolation policies ───────────────────────────────
-- Each policy restricts ALL operations (SELECT, INSERT, UPDATE, DELETE)
-- to rows where tenant_id matches the session variable app.tenant_id.
--
-- IMPORTANT: If app.tenant_id is not set, NO rows will be visible/modifiable.
-- The application MUST set this variable on every database connection.

CREATE POLICY tenant_isolation ON organizations
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON envelopes
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON documents
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON signers
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON fields
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON audit_events
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON templates
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON folders
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON envelope_folders
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON identity_verifications
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON sso_configurations
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON retention_policies
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON users
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON comments
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON api_keys
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY tenant_isolation ON branding_config
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

-- ─── Tenants table: NO RLS ──────────────────────────────────────────
-- The tenants table itself is NOT protected by RLS because:
-- 1. The application needs to look up tenant info before setting the context
-- 2. Control plane operations need to manage tenants
-- 3. Tenant-level data isolation is enforced on child tables
--
-- If tenant table protection is needed, implement it in application logic.
