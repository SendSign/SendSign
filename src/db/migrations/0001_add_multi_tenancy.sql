-- =====================================================================
-- Migration: Add Multi-Tenancy Support
-- Creates the tenants table, adds tenant_id FK to all existing tables,
-- backfills existing rows with a default tenant, and adds indexes.
-- =====================================================================

-- ─── 1. Create Tenants Table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"envelope_limit" integer DEFAULT 5 NOT NULL,
	"user_limit" integer DEFAULT 1 NOT NULL,
	"template_limit" integer DEFAULT 3 NOT NULL,
	"bulk_send_limit" integer DEFAULT 0 NOT NULL,
	"audit_retention_days" integer DEFAULT 7 NOT NULL,
	"branding_config" jsonb,
	"sso_config" jsonb,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"license_type" text DEFAULT 'agpl' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_tenants_slug" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_status" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_stripe" ON "tenants" USING btree ("stripe_customer_id");--> statement-breakpoint

-- ─── 2. Insert Default Tenant for existing data ────────────────────

INSERT INTO "tenants" ("id", "name", "slug", "plan", "status", "envelope_limit", "user_limit", "template_limit", "bulk_send_limit", "audit_retention_days", "license_type")
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Default Tenant',
  'default',
  'enterprise',
  'active',
  999999,
  999999,
  999999,
  999999,
  365,
  'agpl'
) ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

-- ─── 3. Add tenant_id (nullable) to all tables ─────────────────────

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "envelopes" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "signers" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "fields" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "envelope_folders" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "sso_configurations" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "branding_config" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint

-- ─── 4. Backfill all existing rows with the default tenant ─────────

UPDATE "organizations" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "envelopes" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "documents" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "signers" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "fields" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "audit_events" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "templates" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "folders" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "envelope_folders" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "identity_verifications" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "sso_configurations" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "retention_policies" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "users" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "comments" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "api_keys" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "branding_config" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint

-- ─── 5. Set DEFAULT and alter tenant_id to NOT NULL ────────────────
-- The default ensures existing code that doesn't pass tenantId yet
-- will still work by falling back to the default tenant.

ALTER TABLE "organizations" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "envelopes" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "signers" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fields" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "folders" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "envelope_folders" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_verifications" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sso_configurations" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "retention_policies" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "branding_config" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001', ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint

-- ─── 6. Add foreign key constraints ────────────────────────────────

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signers" ADD CONSTRAINT "signers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_folders" ADD CONSTRAINT "envelope_folders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_configurations" ADD CONSTRAINT "sso_configurations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branding_config" ADD CONSTRAINT "branding_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- ─── 7. Add tenant indexes ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_organizations_tenant" ON "organizations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_envelopes_tenant" ON "envelopes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_envelopes_tenant_status" ON "envelopes" USING btree ("tenant_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_tenant" ON "documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_signers_tenant" ON "signers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fields_tenant" ON "fields" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_tenant" ON "audit_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_tenant_type" ON "audit_events" USING btree ("tenant_id", "event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_templates_tenant" ON "templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_folders_tenant" ON "folders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_envelope_folders_tenant" ON "envelope_folders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_identity_verifications_tenant" ON "identity_verifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sso_configurations_tenant" ON "sso_configurations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_retention_policies_tenant" ON "retention_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_tenant" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_tenant_email" ON "users" USING btree ("tenant_id", "email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comments_tenant" ON "comments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_tenant" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branding_config_tenant" ON "branding_config" USING btree ("tenant_id");
