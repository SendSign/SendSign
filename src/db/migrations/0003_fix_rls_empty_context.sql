-- ─── Fix RLS policies to handle missing tenant context ──────────────────────
-- Issue: When app.tenant_id is not set, current_setting returns empty string,
-- which causes RLS to fail-open (allow all access). This is a security risk.
-- Solution: Update policies to explicitly deny access when tenant_id is not set.

-- Drop existing policies
DROP POLICY IF EXISTS tenant_isolation ON organizations;
DROP POLICY IF EXISTS tenant_isolation ON envelopes;
DROP POLICY IF EXISTS tenant_isolation ON documents;
DROP POLICY IF EXISTS tenant_isolation ON signers;
DROP POLICY IF EXISTS tenant_isolation ON fields;
DROP POLICY IF EXISTS tenant_isolation ON audit_events;
DROP POLICY IF EXISTS tenant_isolation ON templates;
DROP POLICY IF EXISTS tenant_isolation ON folders;
DROP POLICY IF EXISTS tenant_isolation ON envelope_folders;
DROP POLICY IF EXISTS tenant_isolation ON identity_verifications;
DROP POLICY IF EXISTS tenant_isolation ON sso_configurations;
DROP POLICY IF EXISTS tenant_isolation ON retention_policies;
DROP POLICY IF EXISTS tenant_isolation ON users;
DROP POLICY IF EXISTS tenant_isolation ON comments;
DROP POLICY IF EXISTS tenant_isolation ON api_keys;
DROP POLICY IF EXISTS tenant_isolation ON branding_config;

-- Create secure policies that deny access when tenant context is missing or invalid
-- The policy checks:
-- 1. current_setting must not be empty string
-- 2. tenant_id must match the session's tenant_id

CREATE POLICY tenant_isolation ON organizations
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON envelopes
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON documents
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON signers
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON fields
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON audit_events
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON templates
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON folders
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON envelope_folders
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON identity_verifications
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON sso_configurations
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON retention_policies
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON users
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON comments
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON api_keys
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY tenant_isolation ON branding_config
  FOR ALL
  USING (
    current_setting('app.tenant_id', true) != '' AND
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );
