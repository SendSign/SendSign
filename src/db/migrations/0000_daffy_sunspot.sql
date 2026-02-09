CREATE TYPE "public"."envelope_status" AS ENUM('draft', 'sent', 'in_progress', 'completed', 'voided', 'expired');--> statement-breakpoint
CREATE TYPE "public"."field_type" AS ENUM('signature', 'initial', 'date', 'text', 'checkbox', 'radio', 'dropdown', 'number', 'currency', 'calculated', 'attachment');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."signing_mode" AS ENUM('remote', 'in_person');--> statement-breakpoint
CREATE TYPE "public"."verification_level" AS ENUM('simple', 'advanced', 'qualified');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"name" text,
	"permissions" text[] DEFAULT '{"all"}',
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"envelope_id" uuid NOT NULL,
	"signer_id" uuid,
	"event_type" text NOT NULL,
	"event_data" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"user_agent" text,
	"geolocation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"envelope_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text DEFAULT 'application/pdf' NOT NULL,
	"storage_path" text NOT NULL,
	"document_hash" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"visibility" text[] DEFAULT '{"all"}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"subject" text NOT NULL,
	"message" text,
	"status" "envelope_status" DEFAULT 'draft' NOT NULL,
	"signing_mode" "signing_mode" DEFAULT 'remote' NOT NULL,
	"signing_order" text DEFAULT 'sequential' NOT NULL,
	"verification_level" "verification_level" DEFAULT 'simple' NOT NULL,
	"routing_rules" jsonb,
	"is_powerform" boolean DEFAULT false NOT NULL,
	"document_key" text,
	"sealed_key" text,
	"completion_cert" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" text DEFAULT 'system' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"envelope_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"signer_id" uuid,
	"type" "field_type" NOT NULL,
	"page" integer NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"value" text,
	"filled_at" timestamp with time zone,
	"options" jsonb,
	"formula" text,
	"conditional_rules" jsonb,
	"linked_group_id" text,
	"validation_rules" jsonb,
	"anchor_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signer_id" uuid NOT NULL,
	"method" text NOT NULL,
	"status" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"provider" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"envelope_limit" integer,
	"envelopes_used" integer DEFAULT 0 NOT NULL,
	"billing_email" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"retention_days" integer NOT NULL,
	"document_types" text[],
	"auto_delete" boolean DEFAULT false NOT NULL,
	"notify_before" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"envelope_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'signer' NOT NULL,
	"signing_order" integer DEFAULT 1 NOT NULL,
	"signing_group" integer,
	"notification_channel" "notification_channel" DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text,
	"token_expires" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"signature_image" text,
	"ip_address" text,
	"user_agent" text,
	"geolocation" text,
	"declined_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sso_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"provider_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_configurations_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"document_key" text NOT NULL,
	"field_config" jsonb NOT NULL,
	"signer_roles" jsonb NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signers" ADD CONSTRAINT "signers_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_envelope" ON "audit_events" USING btree ("envelope_id");--> statement-breakpoint
CREATE INDEX "idx_audit_type" ON "audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_documents_envelope" ON "documents" USING btree ("envelope_id");--> statement-breakpoint
CREATE INDEX "idx_envelopes_status" ON "envelopes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_envelopes_created_by" ON "envelopes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_envelopes_organization" ON "envelopes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_fields_envelope" ON "fields" USING btree ("envelope_id");--> statement-breakpoint
CREATE INDEX "idx_signers_envelope" ON "signers" USING btree ("envelope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_signers_token" ON "signers" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_signers_email" ON "signers" USING btree ("email");