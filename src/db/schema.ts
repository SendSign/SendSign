import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────────────

export const envelopeStatusEnum = pgEnum('envelope_status', [
  'draft',
  'sent',
  'in_progress',
  'completed',
  'voided',
  'expired',
]);

export const signingModeEnum = pgEnum('signing_mode', ['remote', 'in_person']);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'email',
  'sms',
  'whatsapp',
]);

export const fieldTypeEnum = pgEnum('field_type', [
  'signature',
  'initial',
  'date',
  'text',
  'checkbox',
  'radio',
  'dropdown',
  'number',
  'currency',
  'calculated',
  'attachment',
]);

export const verificationLevelEnum = pgEnum('verification_level', [
  'simple',
  'advanced',
  'qualified',
]);

// ─── Tenants (multi-tenancy foundation) ─────────────────────────

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    plan: text('plan', { enum: ['free', 'pro', 'business', 'enterprise', 'managed', 'whitelabel'] }).notNull().default('free'),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status', { enum: ['active', 'trialing', 'past_due', 'canceled', 'suspended'] }).notNull().default('active'),
    envelopeLimit: integer('envelope_limit').notNull().default(5),
    userLimit: integer('user_limit').notNull().default(1),
    templateLimit: integer('template_limit').notNull().default(3),
    bulkSendLimit: integer('bulk_send_limit').notNull().default(0),
    auditRetentionDays: integer('audit_retention_days').notNull().default(7),
    brandingConfig: jsonb('branding_config'),
    ssoConfig: jsonb('sso_config'),
    features: jsonb('features').notNull().default('{}'),
    licenseType: text('license_type', { enum: ['agpl', 'commercial'] }).notNull().default('agpl'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_tenants_slug').on(table.slug),
    index('idx_tenants_status').on(table.status),
    index('idx_tenants_stripe').on(table.stripeCustomerId),
  ],
);

// ─── Organizations ───────────────────────────────────────────────

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    plan: text('plan').notNull().default('free'),
    envelopeLimit: integer('envelope_limit'),
    envelopesUsed: integer('envelopes_used').notNull().default(0),
    billingEmail: text('billing_email'),
    settings: jsonb('settings').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_organizations_tenant').on(table.tenantId),
  ],
);

// ─── Envelopes ───────────────────────────────────────────────────

export const envelopes = pgTable(
  'envelopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    organizationId: uuid('organization_id').references(() => organizations.id),
    subject: text('subject').notNull(),
    message: text('message'),
    status: envelopeStatusEnum('status').notNull().default('draft'),
    signingMode: signingModeEnum('signing_mode').notNull().default('remote'),
    signingOrder: text('signing_order').notNull().default('sequential'),
    verificationLevel: verificationLevelEnum('verification_level')
      .notNull()
      .default('simple'),
    routingRules: jsonb('routing_rules'),
    isPowerform: boolean('is_powerform').notNull().default(false),
    documentKey: text('document_key'),
    sealedKey: text('sealed_key'),
    completionCertKey: text('completion_cert'),
    metadata: jsonb('metadata').default({}),
    createdBy: text('created_by').notNull().default('system'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_envelopes_tenant').on(table.tenantId),
    index('idx_envelopes_tenant_status').on(table.tenantId, table.status),
    index('idx_envelopes_status').on(table.status),
    index('idx_envelopes_created_by').on(table.createdBy),
    index('idx_envelopes_organization').on(table.organizationId),
  ],
);

// ─── Documents (multi-document envelopes) ────────────────────────

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => envelopes.id),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull().default('application/pdf'),
    storagePath: text('storage_path').notNull(),
    documentHash: text('document_hash').notNull(),
    order: integer('order').notNull().default(0),
    visibility: text('visibility').array().default(['all']),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_documents_tenant').on(table.tenantId),
    index('idx_documents_envelope').on(table.envelopeId),
  ],
);

// ─── Signers ─────────────────────────────────────────────────────

export const signers = pgTable(
  'signers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => envelopes.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    role: text('role').notNull().default('signer'),
    order: integer('signing_order').notNull().default(1),
    signingGroup: integer('signing_group'),
    notificationChannel: notificationChannelEnum('notification_channel')
      .notNull()
      .default('email'),
    status: text('status').notNull().default('pending'),
    signingToken: text('token').unique(),
    tokenExpiresAt: timestamp('token_expires', { withTimezone: true }),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signatureImage: text('signature_image'),
    consentedAt: timestamp('consented_at', { withTimezone: true }),
    consentUserAgent: text('consent_user_agent'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    geolocation: text('geolocation'),
    declinedReason: text('declined_reason'),
    delegatedFrom: uuid('delegated_from').references(() => signers.id),
    delayedUntil: timestamp('delayed_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_signers_tenant').on(table.tenantId),
    index('idx_signers_envelope').on(table.envelopeId),
    uniqueIndex('idx_signers_token').on(table.signingToken),
    index('idx_signers_email').on(table.email),
  ],
);

// ─── Fields ──────────────────────────────────────────────────────

export const fields = pgTable(
  'fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => envelopes.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    signerId: uuid('signer_id').references(() => signers.id),
    type: fieldTypeEnum('type').notNull(),
    page: integer('page').notNull(),
    x: real('x').notNull(),
    y: real('y').notNull(),
    width: real('width').notNull(),
    height: real('height').notNull(),
    required: boolean('required').notNull().default(true),
    value: text('value'),
    filledAt: timestamp('filled_at', { withTimezone: true }),
    options: jsonb('options'),
    formula: text('formula'),
    conditionalRules: jsonb('conditional_rules'),
    linkedGroupId: text('linked_group_id'),
    validationRules: jsonb('validation_rules'),
    anchorText: text('anchor_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fields_tenant').on(table.tenantId),
    index('idx_fields_envelope').on(table.envelopeId),
  ],
);

// ─── Audit Events ────────────────────────────────────────────────

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => envelopes.id),
    signerId: uuid('signer_id').references(() => signers.id),
    eventType: text('event_type').notNull(),
    eventData: jsonb('event_data').default({}),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    geolocation: text('geolocation'),
    // Hash chain for tamper-proofing (SHA-256 of previous event + this event's data)
    eventHash: text('event_hash'),
    previousHash: text('previous_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_tenant').on(table.tenantId),
    index('idx_audit_tenant_type').on(table.tenantId, table.eventType),
    index('idx_audit_envelope').on(table.envelopeId),
    index('idx_audit_type').on(table.eventType),
    index('idx_audit_created').on(table.createdAt),
  ],
);

// ─── Templates ───────────────────────────────────────────────────

export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    organizationId: uuid('organization_id').references(() => organizations.id),
    name: text('name').notNull(),
    description: text('description'),
    documentKey: text('document_key').notNull(),
    fieldConfig: jsonb('field_config').notNull(),
    signerRoles: jsonb('signer_roles').notNull(),
    createdBy: text('created_by').notNull().default('system'),
    isLocked: boolean('is_locked').notNull().default(false),
    lockedBy: text('locked_by'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_templates_tenant').on(table.tenantId),
  ],
);

// ─── Folders (Step 25.2) ─────────────────────────────────────────

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    name: text('name').notNull(),
    parentId: uuid('parent_id').references(() => folders.id),
    createdBy: text('created_by').notNull(),
    sharedWith: text('shared_with').array().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_folders_tenant').on(table.tenantId),
    index('idx_folders_created_by').on(table.createdBy),
  ],
);

export const envelopeFolders = pgTable(
  'envelope_folders',
  {
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => envelopes.id),
    folderId: uuid('folder_id')
      .notNull()
      .references(() => folders.id),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_envelope_folders_tenant').on(table.tenantId),
    index('idx_envelope_folders_envelope').on(table.envelopeId),
    index('idx_envelope_folders_folder').on(table.folderId),
  ],
);

// ─── Identity Verifications ──────────────────────────────────────

export const identityVerifications = pgTable(
  'identity_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    signerId: uuid('signer_id')
      .notNull()
      .references(() => signers.id),
    method: text('method').notNull(),
    status: text('status').notNull(),
    evidence: jsonb('evidence').notNull(),
    provider: text('provider'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_identity_verifications_tenant').on(table.tenantId),
  ],
);

// ─── SSO Configurations ─────────────────────────────────────────

export const ssoConfigurations = pgTable(
  'sso_configurations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    organizationId: text('organization_id').notNull().unique(),
    providerType: text('provider_type').notNull(),
    config: jsonb('config').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_sso_configurations_tenant').on(table.tenantId),
  ],
);

// ─── Retention Policies ──────────────────────────────────────────

export const retentionPolicies = pgTable(
  'retention_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    organizationId: uuid('organization_id').references(() => organizations.id),
    name: text('name').notNull(),
    description: text('description'),
    retentionDays: integer('retention_days').notNull(),
    documentTypes: text('document_types').array(),
    autoDelete: boolean('auto_delete').notNull().default(false),
    notifyBefore: integer('notify_before').notNull().default(30),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_retention_policies_tenant').on(table.tenantId),
  ],
);

// ─── Users (RBAC — Step 27) ─────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['admin', 'sender', 'viewer']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    organizationId: uuid('organization_id').references(() => organizations.id),
    email: text('email').notNull().unique(),
    name: text('name'),
    role: userRoleEnum('role').notNull().default('sender'),
    isActive: boolean('is_active').notNull().default(true),
    ssoSubject: text('sso_subject').unique(),
    passwordHash: text('password_hash'),
    // Account lockout fields
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastFailedAt: timestamp('last_failed_at', { withTimezone: true }),
    // GDPR / privacy fields
    gdprConsentAt: timestamp('gdpr_consent_at', { withTimezone: true }),
    gdprConsentVersion: text('gdpr_consent_version'),
    ccpaOptOut: boolean('ccpa_opt_out').notNull().default(false),
    marketingConsent: boolean('marketing_consent').notNull().default(false),
    privacyPolicyVersion: text('privacy_policy_version'),
    dataExportRequestedAt: timestamp('data_export_requested_at', { withTimezone: true }),
    erasureRequestedAt: timestamp('erasure_requested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_users_tenant').on(table.tenantId),
    index('idx_users_tenant_email').on(table.tenantId, table.email),
    index('idx_users_email').on(table.email),
    index('idx_users_sso_subject').on(table.ssoSubject),
    index('idx_users_organization').on(table.organizationId),
  ],
);

// ─── Comments (Step 28) ─────────────────────────────────────────

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => envelopes.id),
    signerId: uuid('signer_id')
      .notNull()
      .references(() => signers.id),
    documentId: uuid('document_id').references(() => documents.id),
    fieldId: uuid('field_id').references(() => fields.id),
    page: integer('page'),
    x: real('x'),
    y: real('y'),
    content: text('content').notNull(),
    parentId: uuid('parent_id').references(() => comments.id),
    resolved: boolean('resolved').notNull().default(false),
    resolvedBy: uuid('resolved_by').references(() => signers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_comments_tenant').on(table.tenantId),
    index('idx_comments_envelope').on(table.envelopeId),
    index('idx_comments_field').on(table.fieldId),
    index('idx_comments_parent').on(table.parentId),
  ],
);

// ─── API Keys ────────────────────────────────────────────────────

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    keyHash: text('key_hash').notNull(),
    name: text('name'),
    permissions: text('permissions').array().default(['all']),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_api_keys_tenant').on(table.tenantId),
  ],
);

// ─── Relations ───────────────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ many }) => ({
  organizations: many(organizations),
  envelopes: many(envelopes),
  documents: many(documents),
  signers: many(signers),
  fields: many(fields),
  auditEvents: many(auditEvents),
  templates: many(templates),
  folders: many(folders),
  envelopeFolders: many(envelopeFolders),
  identityVerifications: many(identityVerifications),
  ssoConfigurations: many(ssoConfigurations),
  retentionPolicies: many(retentionPolicies),
  users: many(users),
  comments: many(comments),
  apiKeys: many(apiKeys),
  brandingConfigs: many(brandingConfigs),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [organizations.tenantId],
    references: [tenants.id],
  }),
  envelopes: many(envelopes),
  templates: many(templates),
  apiKeys: many(apiKeys),
  retentionPolicies: many(retentionPolicies),
}));

export const envelopesRelations = relations(envelopes, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [envelopes.tenantId],
    references: [tenants.id],
  }),
  organization: one(organizations, {
    fields: [envelopes.organizationId],
    references: [organizations.id],
  }),
  documents: many(documents),
  signers: many(signers),
  fields: many(fields),
  auditEvents: many(auditEvents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [documents.tenantId],
    references: [tenants.id],
  }),
  envelope: one(envelopes, {
    fields: [documents.envelopeId],
    references: [envelopes.id],
  }),
  fields: many(fields),
}));

export const signersRelations = relations(signers, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [signers.tenantId],
    references: [tenants.id],
  }),
  envelope: one(envelopes, {
    fields: [signers.envelopeId],
    references: [envelopes.id],
  }),
  fields: many(fields),
  auditEvents: many(auditEvents),
  identityVerifications: many(identityVerifications),
}));

export const fieldsRelations = relations(fields, ({ one }) => ({
  tenant: one(tenants, {
    fields: [fields.tenantId],
    references: [tenants.id],
  }),
  envelope: one(envelopes, {
    fields: [fields.envelopeId],
    references: [envelopes.id],
  }),
  document: one(documents, {
    fields: [fields.documentId],
    references: [documents.id],
  }),
  signer: one(signers, {
    fields: [fields.signerId],
    references: [signers.id],
  }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditEvents.tenantId],
    references: [tenants.id],
  }),
  envelope: one(envelopes, {
    fields: [auditEvents.envelopeId],
    references: [envelopes.id],
  }),
  signer: one(signers, {
    fields: [auditEvents.signerId],
    references: [signers.id],
  }),
}));

export const templatesRelations = relations(templates, ({ one }) => ({
  tenant: one(tenants, {
    fields: [templates.tenantId],
    references: [tenants.id],
  }),
  organization: one(organizations, {
    fields: [templates.organizationId],
    references: [organizations.id],
  }),
}));

export const identityVerificationsRelations = relations(
  identityVerifications,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [identityVerifications.tenantId],
      references: [tenants.id],
    }),
    signer: one(signers, {
      fields: [identityVerifications.signerId],
      references: [signers.id],
    }),
  }),
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  tenant: one(tenants, {
    fields: [apiKeys.tenantId],
    references: [tenants.id],
  }),
  organization: one(organizations, {
    fields: [apiKeys.organizationId],
    references: [organizations.id],
  }),
}));

export const retentionPoliciesRelations = relations(retentionPolicies, ({ one }) => ({
  tenant: one(tenants, {
    fields: [retentionPolicies.tenantId],
    references: [tenants.id],
  }),
  organization: one(organizations, {
    fields: [retentionPolicies.organizationId],
    references: [organizations.id],
  }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [comments.tenantId],
    references: [tenants.id],
  }),
  envelope: one(envelopes, {
    fields: [comments.envelopeId],
    references: [envelopes.id],
  }),
  signer: one(signers, {
    fields: [comments.signerId],
    references: [signers.id],
  }),
  document: one(documents, {
    fields: [comments.documentId],
    references: [documents.id],
  }),
  field: one(fields, {
    fields: [comments.fieldId],
    references: [fields.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: 'commentReplies',
  }),
}));

// ─── Branding Configuration (Step 32) ───────────────────────────

export const brandingConfigs = pgTable(
  'branding_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().default('00000000-0000-0000-0000-000000000001').references(() => tenants.id),
    organizationId: uuid('organization_id').references(() => organizations.id),
  logoUrl: text('logo_url'),
  logoData: text('logo_data'), // Base64-encoded logo
  primaryColor: text('primary_color').notNull().default('#2563EB'),
  secondaryColor: text('secondary_color').notNull().default('#1E40AF'),
  accentColor: text('accent_color').notNull().default('#3B82F6'),
  companyName: text('company_name'), // Replaces "SendSign" in UI
  emailFooter: text('email_footer'), // Custom email footer text
  signingHeader: text('signing_header'), // Custom text above signing area
  faviconUrl: text('favicon_url'),
    customCss: text('custom_css'), // Additional CSS overrides (sandboxed)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_branding_config_tenant').on(table.tenantId),
  ],
);

export const brandingConfigsRelations = relations(brandingConfigs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [brandingConfigs.tenantId],
    references: [tenants.id],
  }),
  organization: one(organizations, {
    fields: [brandingConfigs.organizationId],
    references: [organizations.id],
  }),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [folders.tenantId],
    references: [tenants.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: 'folderChildren',
  }),
  envelopeFolders: many(envelopeFolders),
}));

export const envelopeFoldersRelations = relations(envelopeFolders, ({ one }) => ({
  tenant: one(tenants, {
    fields: [envelopeFolders.tenantId],
    references: [tenants.id],
  }),
  envelope: one(envelopes, {
    fields: [envelopeFolders.envelopeId],
    references: [envelopes.id],
  }),
  folder: one(folders, {
    fields: [envelopeFolders.folderId],
    references: [folders.id],
  }),
}));

export const ssoConfigurationsRelations = relations(ssoConfigurations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [ssoConfigurations.tenantId],
    references: [tenants.id],
  }),
}));

// ─── Type exports ────────────────────────────────────────────────

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;
export type Envelope = typeof envelopes.$inferSelect;
export type InsertEnvelope = typeof envelopes.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;
export type Signer = typeof signers.$inferSelect;
export type InsertSigner = typeof signers.$inferInsert;
export type Field = typeof fields.$inferSelect;
export type InsertField = typeof fields.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = typeof templates.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;
export type IdentityVerification = typeof identityVerifications.$inferSelect;
export type InsertIdentityVerification = typeof identityVerifications.$inferInsert;
export type SsoConfiguration = typeof ssoConfigurations.$inferSelect;
export type InsertSsoConfiguration = typeof ssoConfigurations.$inferInsert;
export type RetentionPolicy = typeof retentionPolicies.$inferSelect;
export type InsertRetentionPolicy = typeof retentionPolicies.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;
export type BrandingConfig = typeof brandingConfigs.$inferSelect;
export type InsertBrandingConfig = typeof brandingConfigs.$inferInsert;
