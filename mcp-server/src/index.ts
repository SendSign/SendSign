#!/usr/bin/env node

/**
 * SendSign MCP Server
 *
 * Exposes SendSign e-signature tools to Claude Desktop / Cowork
 * via the Model Context Protocol.
 *
 * Usage:
 *   node dist/index.js          — stdio transport (default, for Claude Desktop spawn)
 *   node dist/index.js --http   — HTTP+SSE transport on port 3001 (for Cowork / remote)
 *
 * Environment variables:
 *   SENDSIGN_API_URL   — Base URL of the SendSign instance (default: http://localhost:3000)
 *   SENDSIGN_API_KEY   — API key for authentication (required)
 *   MCP_HTTP_PORT    — Port for HTTP mode (default: 3001)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  createEnvelope,
  sendEnvelope,
  checkStatus,
  listEnvelopes,
  voidEnvelope,
  downloadSigned,
  downloadCertificate,
  sendReminder,
  getAuditTrail,
  createTemplate,
  listTemplates,
  useTemplate,
  bulkSend,
  getAnalytics,
  getRetentionPolicies,
  assignRetention,
  getExpiringDocuments,
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  createFromLegalReview,
} from './sendsign-client.js';

// ─── Tool Registration ──────────────────────────────────────────────
// Extracted into a factory so each SSE session gets its own McpServer
// instance with tools registered. The Protocol base class only allows
// one transport at a time, so we need a fresh server per SSE session.

function createMcpServer(): McpServer {
  const srv = new McpServer({
    name: 'sendsign',
    version: '0.1.0',
  });

  registerTools(srv);
  return srv;
}

function registerTools(srv: McpServer): void {
  // ─── Tool: create_envelope ──────────────────────────────────────────

  srv.tool(
    'create_envelope',
    'Create a new e-signature envelope with one or more signers. ' +
      'Optionally attach a PDF document by providing a file path. ' +
      'The envelope starts in "draft" status — use send_envelope to send it.',
    {
      subject: z.string().describe('Subject line for the envelope (shown to signers)'),
      message: z.string().optional().describe('Optional message to include in the signing notification email'),
      signing_order: z
        .enum(['sequential', 'parallel'])
        .default('sequential')
        .describe('Whether signers sign in order (sequential) or all at once (parallel)'),
      signers: z
        .array(
          z.object({
            name: z.string().describe("Signer's full name"),
            email: z.string().describe("Signer's email address"),
            role: z
              .string()
              .default('signer')
              .describe('Role: signer, cc, or approver'),
            order: z
              .number()
              .int()
              .positive()
              .optional()
              .describe('Signing order (1-based). Only relevant for sequential signing.'),
          }),
        )
        .describe('List of people who need to sign the document'),
      file_path: z
        .string()
        .optional()
        .describe('Absolute path to a PDF file to attach to the envelope'),
    },
    async ({ subject, message, signing_order, signers, file_path }) => {
      const result = await createEnvelope({
        subject,
        message,
        signingOrder: signing_order,
        signers: signers.map((s: { name: string; email: string; role: string; order?: number }, i: number) => ({
          name: s.name,
          email: s.email,
          role: s.role,
          order: s.order ?? i + 1,
        })),
        filePath: file_path,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to create envelope: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      const env = result.data!;
      const signerList = env.signers
        .map((s: { name: string; email: string; status: string }) => `  - ${s.name} <${s.email}> (${s.status})`)
        .join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Envelope created successfully.`,
              ``,
              `ID:      ${env.id}`,
              `Subject: ${env.subject}`,
              `Status:  ${env.status}`,
              `Signers:`,
              signerList,
              ``,
              `Next step: call send_envelope with envelope_id="${env.id}" to send it to signers.`,
            ].join('\n'),
          },
        ],
      };
    },
  );

  // ─── Tool: send_envelope ────────────────────────────────────────────

  srv.tool(
    'send_envelope',
    'Send a draft envelope to its signers. ' +
      'This generates signing tokens, sends notification emails, and transitions the envelope to "sent" status.',
    {
      envelope_id: z.string().uuid().describe('The envelope ID to send'),
    },
    async ({ envelope_id }) => {
      const result = await sendEnvelope(envelope_id);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to send envelope: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Envelope ${envelope_id} has been sent to all signers. They will receive signing links via email.`,
          },
        ],
      };
    },
  );

  // ─── Tool: check_status ─────────────────────────────────────────────

  srv.tool(
    'check_status',
    'Get the current status and details of an envelope, including signer progress.',
    {
      envelope_id: z.string().uuid().describe('The envelope ID to check'),
    },
    async ({ envelope_id }) => {
      const result = await checkStatus(envelope_id);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to check status: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      const env = result.data!;
      const signerLines = env.signers.map((s: { name: string; email: string; status: string; signedAt: string | null }) => {
        const signed = s.signedAt ? ` (signed ${new Date(s.signedAt).toLocaleString()})` : '';
        return `  - ${s.name} <${s.email}>: ${s.status}${signed}`;
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Envelope: ${env.subject}`,
              `ID:       ${env.id}`,
              `Status:   ${env.status}`,
              `Created:  ${new Date(env.createdAt).toLocaleString()}`,
              env.sentAt ? `Sent:     ${new Date(env.sentAt).toLocaleString()}` : null,
              env.completedAt
                ? `Completed: ${new Date(env.completedAt).toLocaleString()}`
                : null,
              ``,
              `Signers (${env.signers.length}):`,
              ...signerLines,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };
    },
  );

  // ─── Tool: list_envelopes ───────────────────────────────────────────

  srv.tool(
    'list_envelopes',
    'List recent envelopes. Optionally filter by status (draft, sent, completed, voided, expired).',
    {
      status: z
        .enum(['draft', 'sent', 'in_progress', 'completed', 'voided', 'expired'])
        .optional()
        .describe('Filter by envelope status'),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .default(20)
        .describe('Max number of envelopes to return (default: 20)'),
    },
    async ({ status, limit }) => {
      const result = await listEnvelopes({ status, limit });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to list envelopes: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      const data = result.data!;

      if (data.envelopes.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: status
                ? `No envelopes found with status "${status}".`
                : 'No envelopes found.',
            },
          ],
        };
      }

      const lines = data.envelopes.map((env: { id: string; status: string; subject: string; signers: Array<{ status: string }> }) => {
        const signerCount = env.signers.length;
        const signedCount = env.signers.filter(
          (s: { status: string }) => s.status === 'completed' || s.status === 'signed',
        ).length;
        return `  ${env.id}  ${env.status.padEnd(12)} ${signedCount}/${signerCount} signed  "${env.subject}"`;
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Showing ${data.envelopes.length} of ${data.total} envelopes${status ? ` (status: ${status})` : ''}:`,
              ``,
              `  ${'ID'.padEnd(36)}  ${'Status'.padEnd(12)} Progress     Subject`,
              `  ${'─'.repeat(36)}  ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(20)}`,
              ...lines,
            ].join('\n'),
          },
        ],
      };
    },
  );

  // ─── Tool: void_envelope ────────────────────────────────────────────

  srv.tool(
    'void_envelope',
    'Void (cancel) an envelope. This prevents any further signing and marks the envelope as voided. ' +
      'Cannot be undone. Completed envelopes cannot be voided.',
    {
      envelope_id: z.string().uuid().describe('The envelope ID to void'),
      reason: z
        .string()
        .optional()
        .describe('Optional reason for voiding the envelope'),
    },
    async ({ envelope_id, reason }) => {
      const result = await voidEnvelope(envelope_id, reason);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to void envelope: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Envelope ${envelope_id} has been voided.${reason ? ` Reason: ${reason}` : ''}`,
          },
        ],
      };
    },
  );

  // ─── Tool: download_signed ───────────────────────────────────────────

  srv.tool(
    'download_signed',
    'Get download URLs for the sealed signed PDF and completion certificate for a completed envelope.',
    {
      envelope_id: z.string().uuid().describe('The envelope ID to download'),
    },
    async ({ envelope_id }) => {
      // First verify envelope is completed
      const status = await checkStatus(envelope_id);
      if (!status.success) {
        return { content: [{ type: 'text' as const, text: `Failed to check envelope: ${status.error}` }], isError: true };
      }

      if (status.data!.status !== 'completed') {
        return { content: [{ type: 'text' as const, text: `Envelope is not completed yet (status: ${status.data!.status}). Documents are only available after all signers have signed.` }], isError: true };
      }

      const pdfResult = await downloadSigned(envelope_id);
      const certResult = await downloadCertificate(envelope_id);

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Signed document and certificate are ready for download:`,
            ``,
            `Sealed PDF:     ${pdfResult.data!.url}`,
            `Certificate:    ${certResult.data!.url}`,
            ``,
            `These are direct download URLs. The sealed PDF contains cryptographic signatures that can be independently verified.`,
          ].join('\n'),
        }],
      };
    },
  );

  // ─── Tool: send_reminder ─────────────────────────────────────────────

  srv.tool(
    'send_reminder',
    'Send a reminder to all pending signers on an envelope. Regenerates expired tokens if needed.',
    {
      envelope_id: z.string().uuid().describe('The envelope ID to send reminders for'),
    },
    async ({ envelope_id }) => {
      const result = await sendReminder(envelope_id);

      if (!result.success) {
        return { content: [{ type: 'text' as const, text: `Failed to send reminder: ${result.error}` }], isError: true };
      }

      const resent = (result.data as { resent: number })?.resent ?? 0;
      return {
        content: [{
          type: 'text' as const,
          text: resent > 0
            ? `Reminders sent to ${resent} pending signer${resent > 1 ? 's' : ''} on envelope ${envelope_id}.`
            : `No pending signers to remind on envelope ${envelope_id}. All signers may have already completed.`,
        }],
      };
    },
  );

  // ─── Tool: get_audit_trail ───────────────────────────────────────────

  srv.tool(
    'get_audit_trail',
    'Get the full audit trail for an envelope — every action taken, by whom, when, and from where.',
    {
      envelope_id: z.string().uuid().describe('The envelope ID to get audit trail for'),
    },
    async ({ envelope_id }) => {
      const result = await getAuditTrail(envelope_id);

      if (!result.success) {
        return { content: [{ type: 'text' as const, text: `Failed to get audit trail: ${result.error}` }], isError: true };
      }

      const data = result.data as { envelope: { subject: string; status: string }; events: Array<{ eventType: string; createdAt: string; signerName: string | null; ipAddress: string | null; geolocation: string | null }> };

      const lines = data.events.map((e) => {
        const who = e.signerName ? ` by ${e.signerName}` : '';
        const where = e.geolocation ? ` from ${e.geolocation}` : '';
        return `  ${new Date(e.createdAt).toLocaleString()}  ${e.eventType}${who}${where}`;
      });

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Audit Trail for "${data.envelope.subject}" (${data.envelope.status})`,
            `${'─'.repeat(60)}`,
            ...lines,
            ``,
            `Total events: ${data.events.length}`,
          ].join('\n'),
        }],
      };
    },
  );

  // ─── Tool: create_template ───────────────────────────────────────────

  srv.tool(
    'create_template',
    'Create a reusable signing template. Templates define signer roles and field placements that can be reused across many envelopes.',
    {
      name: z.string().describe('Template name (e.g., "Standard NDA", "Employment Agreement")'),
      description: z.string().optional().describe('Template description'),
      signer_roles: z.array(z.object({
        role: z.string().describe('Role name (e.g., "Client", "Company Representative")'),
        order: z.number().int().positive().describe('Signing order (1-based)'),
      })).describe('Signer roles that will be filled when the template is used'),
    },
    async ({ name, description, signer_roles }) => {
      const result = await createTemplate({ name, description, signerRoles: signer_roles });

      if (!result.success) {
        return { content: [{ type: 'text' as const, text: `Failed to create template: ${result.error}` }], isError: true };
      }

      const tmpl = result.data as { id: string; name: string };
      return {
        content: [{
          type: 'text' as const,
          text: `Template "${tmpl.name}" created successfully (ID: ${tmpl.id}). Use the use_template tool to create envelopes from it.`,
        }],
      };
    },
  );

  // ─── Tool: list_templates ────────────────────────────────────────────

  srv.tool(
    'list_templates',
    'List all available signing templates.',
    {},
    async () => {
      const result = await listTemplates();

      if (!result.success) {
        return { content: [{ type: 'text' as const, text: `Failed to list templates: ${result.error}` }], isError: true };
      }

      const templates = result.data as Array<{ id: string; name: string; description: string | null; createdAt: string }>;

      if (!templates || templates.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No templates found. Use create_template to create one.' }] };
      }

      const lines = templates.map((t) =>
        `  ${t.id}  "${t.name}"${t.description ? ` — ${t.description}` : ''}`
      );

      return {
        content: [{
          type: 'text' as const,
          text: [`Available templates (${templates.length}):`, '', ...lines].join('\n'),
        }],
      };
    },
  );

  // ─── Tool: use_template ──────────────────────────────────────────────

  srv.tool(
    'use_template',
    'Create and send a new envelope from an existing template. Map real people to the template roles.',
    {
      template_id: z.string().uuid().describe('The template ID to use'),
      signers: z.array(z.object({
        name: z.string().describe("Signer's full name"),
        email: z.string().describe("Signer's email address"),
        role: z.string().optional().describe('Template role to fill (must match a role defined in the template)'),
      })).describe('People to assign to the template roles'),
      send_immediately: z.boolean().default(false).describe('Whether to send immediately after creating'),
    },
    async ({ template_id, signers, send_immediately }) => {
      const result = await useTemplate(template_id, signers);

      if (!result.success) {
        return { content: [{ type: 'text' as const, text: `Failed to use template: ${result.error}` }], isError: true };
      }

      const env = result.data as { id: string; subject: string; status: string };

      if (send_immediately) {
        const sendResult = await sendEnvelope(env.id);
        if (!sendResult.success) {
          return { content: [{ type: 'text' as const, text: `Envelope created (${env.id}) but failed to send: ${sendResult.error}` }], isError: true };
        }
        return {
          content: [{
            type: 'text' as const,
            text: `Envelope "${env.subject}" created from template and sent to ${signers.length} signer${signers.length > 1 ? 's' : ''}. (ID: ${env.id})`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Envelope "${env.subject}" created from template (ID: ${env.id}). Status: ${env.status}. Use send_envelope to send it.`,
        }],
      };
    },
  );

  // ─── Tool: bulk_send ─────────────────────────────────────────────────

  srv.tool(
    'bulk_send',
    'Send the same document to multiple recipients at once using a template. Ideal for NDAs, offer letters, or any document that goes to many people.',
    {
      template_id: z.string().uuid().describe('Template ID to use for all envelopes'),
      recipients: z.array(z.object({
        name: z.string().describe("Recipient's full name"),
        email: z.string().describe("Recipient's email address"),
        merge_data: z.record(z.string()).optional().describe('Per-recipient merge data (e.g., {"company": "Acme"})'),
      })).describe('List of recipients — one envelope will be created per recipient'),
    },
    async ({ template_id, recipients }) => {
      const result = await bulkSend({
        templateId: template_id,
        recipients: recipients.map((r) => ({
          name: r.name,
          email: r.email,
          mergeData: r.merge_data,
        })),
      });

      if (!result.success) {
        return { content: [{ type: 'text' as const, text: `Failed to bulk send: ${result.error}` }], isError: true };
      }

      const data = result.data as { batchId: string; created: number; failed: number };
      return {
        content: [{
          type: 'text' as const,
          text: [
            `Bulk send initiated.`,
            `Batch ID:  ${data.batchId}`,
            `Created:   ${data.created} envelopes`,
            data.failed > 0 ? `Failed:    ${data.failed} envelopes` : null,
            ``,
            `All recipients will receive signing links via email.`,
          ].filter(Boolean).join('\n'),
        }],
      };
    },
  );

  // ─── Tool: get_analytics ─────────────────────────────────────────────

  srv.tool(
    'get_analytics',
    'View signing analytics and statistics — completion rates, average time to sign, pending overdue envelopes, etc.',
    {
      period: z.string().default('30d').describe('Time period: "7d", "30d", "90d", or "all"'),
    },
    async ({ period }) => {
      const result = await getAnalytics(period);

      if (!result.success) {
        return { content: [{ type: 'text' as const, text: `Failed to get analytics: ${result.error}` }], isError: true };
      }

      const data = result.data as {
        summary?: { totalEnvelopes?: number; completed?: number; pending?: number; voided?: number; completionRate?: number; avgTimeToComplete?: string };
        [key: string]: unknown;
      };

      const summary = data.summary || data;

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Signing Analytics (${period})`,
            `${'─'.repeat(40)}`,
            summary.totalEnvelopes !== undefined ? `Total envelopes: ${summary.totalEnvelopes}` : null,
            summary.completed !== undefined ? `Completed:       ${summary.completed}` : null,
            summary.pending !== undefined ? `Pending:         ${summary.pending}` : null,
            summary.voided !== undefined ? `Voided:          ${summary.voided}` : null,
            summary.completionRate != null ? `Completion rate: ${(Number(summary.completionRate) * 100).toFixed(1)}%` : null,
            summary.avgTimeToComplete ? `Avg time to sign: ${summary.avgTimeToComplete}` : null,
          ].filter(Boolean).join('\n'),
        }],
      };
    },
  );

  // ─── Tool: manage_retention ──────────────────────────────────────────

  srv.tool(
    'manage_retention',
    'Manage document retention — view policies, assign policies to envelopes, or check which documents are expiring soon.',
    {
      action: z.enum(['list_policies', 'assign', 'expiring']).describe('Action: "list_policies", "assign" (to envelope), or "expiring" (view expiring docs)'),
      envelope_id: z.string().uuid().optional().describe('Envelope ID (required for "assign" action)'),
      policy_id: z.string().uuid().optional().describe('Retention policy ID (required for "assign" action)'),
      days: z.number().int().positive().default(30).describe('Days to look ahead for expiring documents (default: 30)'),
    },
    async ({ action, envelope_id, policy_id, days }) => {
      if (action === 'list_policies') {
        const result = await getRetentionPolicies();
        if (!result.success) {
          return { content: [{ type: 'text' as const, text: `Failed to get policies: ${result.error}` }], isError: true };
        }
        const policies = result.data as Array<{ id: string; name: string; retentionDays: number; autoDelete: boolean }>;
        if (!policies || policies.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No retention policies found.' }] };
        }
        const lines = policies.map((p) => `  ${p.id}  "${p.name}" — ${p.retentionDays} days${p.autoDelete ? ' (auto-delete)' : ''}`);
        return { content: [{ type: 'text' as const, text: [`Retention policies:`, '', ...lines].join('\n') }] };
      }

      if (action === 'assign') {
        if (!envelope_id || !policy_id) {
          return { content: [{ type: 'text' as const, text: 'Both envelope_id and policy_id are required for "assign" action.' }], isError: true };
        }
        const result = await assignRetention(envelope_id, policy_id);
        if (!result.success) {
          return { content: [{ type: 'text' as const, text: `Failed to assign policy: ${result.error}` }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Retention policy assigned to envelope ${envelope_id}.` }] };
      }

      if (action === 'expiring') {
        const result = await getExpiringDocuments(days);
        if (!result.success) {
          return { content: [{ type: 'text' as const, text: `Failed to get expiring documents: ${result.error}` }], isError: true };
        }
        const docs = result.data as Array<{ id: string; subject: string; expiresAt: string }>;
        if (!docs || docs.length === 0) {
          return { content: [{ type: 'text' as const, text: `No documents expiring in the next ${days} days.` }] };
        }
        const lines = docs.map((d) => `  ${d.id}  "${d.subject}" — expires ${new Date(d.expiresAt).toLocaleDateString()}`);
        return { content: [{ type: 'text' as const, text: [`Documents expiring in next ${days} days:`, '', ...lines].join('\n') }] };
      }

      return { content: [{ type: 'text' as const, text: 'Unknown action. Use "list_policies", "assign", or "expiring".' }], isError: true };
    },
  );

  // ─── Tool: manage_webhooks ───────────────────────────────────────────

  srv.tool(
    'manage_webhooks',
    'Register, list, or delete webhooks to receive real-time notifications when envelope events occur.',
    {
      action: z.enum(['register', 'list', 'delete']).describe('Action: "register", "list", or "delete"'),
      url: z.string().url().optional().describe('Webhook URL (required for "register")'),
      events: z.array(z.string()).optional().describe('Events to subscribe to (e.g., ["envelope.completed", "signer.declined"])'),
      webhook_id: z.string().optional().describe('Webhook ID (required for "delete")'),
    },
    async ({ action, url, events, webhook_id }) => {
      if (action === 'register') {
        if (!url || !events || events.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Both url and events are required for "register".' }], isError: true };
        }
        const result = await registerWebhook(url, events);
        if (!result.success) {
          return { content: [{ type: 'text' as const, text: `Failed to register webhook: ${result.error}` }], isError: true };
        }
        const wh = result.data as { id: string; secret: string };
        return {
          content: [{
            type: 'text' as const,
            text: `Webhook registered (ID: ${wh.id}).\nSecret for signature verification: ${wh.secret}\nEvents: ${events.join(', ')}`,
          }],
        };
      }

      if (action === 'list') {
        const result = await listWebhooks();
        if (!result.success) {
          return { content: [{ type: 'text' as const, text: `Failed to list webhooks: ${result.error}` }], isError: true };
        }
        const hooks = result.data as Array<{ id: string; url: string; events: string[] }>;
        if (!hooks || hooks.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No webhooks registered.' }] };
        }
        const lines = hooks.map((h) => `  ${h.id}  ${h.url}  [${h.events.join(', ')}]`);
        return { content: [{ type: 'text' as const, text: [`Registered webhooks:`, '', ...lines].join('\n') }] };
      }

      if (action === 'delete') {
        if (!webhook_id) {
          return { content: [{ type: 'text' as const, text: 'webhook_id is required for "delete".' }], isError: true };
        }
        const result = await deleteWebhook(webhook_id);
        if (!result.success) {
          return { content: [{ type: 'text' as const, text: `Failed to delete webhook: ${result.error}` }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Webhook ${webhook_id} deleted.` }] };
      }

      return { content: [{ type: 'text' as const, text: 'Unknown action.' }], isError: true };
    },
  );

  // ─── Tool: create_from_legal_review ──────────────────────────────────

  srv.tool(
    'create_from_legal_review',
    'Create a signing envelope from a Legal plugin review. This is the handoff tool that bridges ' +
      "Anthropic's Legal plugin (Review → Redline) with SendSign (Sign → Seal). " +
      'Provide the contract parties, reviewed document, and any notes from the legal review.',
    {
      subject: z.string().describe('Envelope subject (e.g., "MSA — Acme Corp")'),
      parties: z.array(z.object({
        name: z.string().describe('Full name of the signing party'),
        email: z.string().describe('Email address'),
        role: z.string().default('signer').describe('Role: "signer", "cc", or "approver"'),
      })).describe('Contract parties extracted from the legal review'),
      file_path: z.string().optional().describe('Path to the reviewed/redlined PDF document'),
      review_notes: z.string().optional().describe('Summary notes from the legal review (included in signer notification)'),
      message: z.string().optional().describe('Custom message to include in the signing notification email'),
      send_immediately: z.boolean().default(false).describe('Send to signers immediately after creation'),
    },
    async ({ subject, parties, file_path, review_notes, message, send_immediately }) => {
      const result = await createFromLegalReview({
        subject,
        message,
        parties,
        filePath: file_path,
        reviewNotes: review_notes,
      });

      if (!result.success) {
        return { content: [{ type: 'text' as const, text: `Failed to create envelope from legal review: ${result.error}` }], isError: true };
      }

      const env = result.data!;

      if (send_immediately) {
        const sendResult = await sendEnvelope(env.id);
        if (!sendResult.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Envelope created (ID: ${env.id}) but failed to send: ${sendResult.error}. You can send it manually with send_envelope.`,
            }],
            isError: true,
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: [
              `Legal review → Signing handoff complete!`,
              ``,
              `Envelope "${env.subject}" has been created and sent to ${parties.length} signing ${parties.length > 1 ? 'parties' : 'party'}.`,
              `ID: ${env.id}`,
              ``,
              review_notes ? `Review notes included in notification.` : '',
              `All parties will receive signing links via email.`,
              `Use check_status to monitor signing progress.`,
            ].filter(Boolean).join('\n'),
          }],
        };
      }

      const signerList = env.signers
        .map((s: { name: string; email: string }) => `  - ${s.name} <${s.email}>`)
        .join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Envelope created from legal review.`,
            ``,
            `ID:      ${env.id}`,
            `Subject: ${env.subject}`,
            `Status:  ${env.status}`,
            `Parties:`,
            signerList,
            ``,
            `Next step: call send_envelope with envelope_id="${env.id}" to send to signers.`,
          ].join('\n'),
        }],
      };
    },
  );
}

// ─── Start Server ───────────────────────────────────────────────────

function logConfig() {
  console.error(`  SendSign API: ${process.env.SENDSIGN_API_URL || 'http://localhost:3000'}`);
  console.error(`  API Key:    ${process.env.SENDSIGN_API_KEY ? '****' + process.env.SENDSIGN_API_KEY.slice(-4) : '(not set)'}`);
}

async function startStdio() {
  const srv = createMcpServer();
  const transport = new StdioServerTransport();
  await srv.connect(transport);
  console.error('SendSign MCP server running on stdio');
  logConfig();
}

async function startHttp() {
  const port = parseInt(process.env.MCP_HTTP_PORT || '3001', 10);

  // Track active SSE sessions: each session gets its own McpServer + transport
  // because the Protocol base class only allows one transport per server instance.
  const sessions = new Map<string, { server: McpServer; transport: SSEServerTransport }>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /sse — establish SSE connection
    if (req.method === 'GET' && url.pathname === '/sse') {
      try {
        // Each SSE session needs its own McpServer instance because
        // Protocol.connect() only supports one transport at a time.
        const sessionServer = createMcpServer();
        const transport = new SSEServerTransport('/messages', res);
        const sessionId = transport.sessionId;

        sessions.set(sessionId, { server: sessionServer, transport });

        transport.onclose = () => {
          sessions.delete(sessionId);
          console.error(`SSE session ${sessionId} closed (${sessions.size} active)`);
        };

        // server.connect() calls transport.start() internally —
        // do NOT call transport.start() separately or it throws
        // "SSEServerTransport already started!"
        await sessionServer.connect(transport);

        console.error(`SSE session ${sessionId} established (${sessions.size} active)`);
        // Response stays open — SSEServerTransport holds the res object
        // and writes events to it. Do NOT call res.end() here.
      } catch (err) {
        console.error('Failed to establish SSE session:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to establish SSE connection' }));
        }
      }
      return;
    }

    // POST /messages?sessionId=... — client sends messages here
    if (req.method === 'POST' && url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing sessionId query parameter' }));
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unknown session' }));
        return;
      }

      try {
        await session.transport.handlePostMessage(req, res);
      } catch (err) {
        console.error(`Error handling message for session ${sessionId}:`, err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
      return;
    }

    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', transport: 'sse', sessions: sessions.size }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.listen(port, () => {
    console.error(`SendSign MCP server running on HTTP+SSE`);
    console.error(`  SSE endpoint: http://localhost:${port}/sse`);
    console.error(`  Messages:     http://localhost:${port}/messages`);
    console.error(`  Health:       http://localhost:${port}/health`);
    logConfig();
  });
}

const useHttp = process.argv.includes('--http');

(useHttp ? startHttp() : startStdio()).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
