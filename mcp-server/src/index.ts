#!/usr/bin/env node

/**
 * CoSeal MCP Server
 *
 * Exposes CoSeal e-signature tools to Claude Desktop / Cowork
 * via the Model Context Protocol.
 *
 * Usage:
 *   node dist/index.js          — stdio transport (default, for Claude Desktop spawn)
 *   node dist/index.js --http   — HTTP+SSE transport on port 3001 (for Cowork / remote)
 *
 * Environment variables:
 *   COSEAL_API_URL   — Base URL of the CoSeal instance (default: http://localhost:3000)
 *   COSEAL_API_KEY   — API key for authentication (required)
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
} from './coseal-client.js';

// ─── Tool Registration ──────────────────────────────────────────────
// Extracted into a factory so each SSE session gets its own McpServer
// instance with tools registered. The Protocol base class only allows
// one transport at a time, so we need a fresh server per SSE session.

function createMcpServer(): McpServer {
  const srv = new McpServer({
    name: 'coseal',
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
}

// ─── Start Server ───────────────────────────────────────────────────

function logConfig() {
  console.error(`  CoSeal API: ${process.env.COSEAL_API_URL || 'http://localhost:3000'}`);
  console.error(`  API Key:    ${process.env.COSEAL_API_KEY ? '****' + process.env.COSEAL_API_KEY.slice(-4) : '(not set)'}`);
}

async function startStdio() {
  const srv = createMcpServer();
  const transport = new StdioServerTransport();
  await srv.connect(transport);
  console.error('CoSeal MCP server running on stdio');
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
    console.error(`CoSeal MCP server running on HTTP+SSE`);
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
