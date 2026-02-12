import { Router, Request, Response } from 'express';
import AdmZip from 'adm-zip';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authenticate } from '../middleware/auth.js';
import { tenantContext, getTenant } from '../middleware/tenantContext.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the plugin template directory
// In development: ../../cowork-plugin/template (relative to src/api/routes/)
// In production: same, since we copy src/ into the container
const TEMPLATE_DIR = path.resolve(__dirname, '../../../cowork-plugin/template');

/**
 * Build a plugin zip with the given SendSign URL and API key.
 * Reads the template files, replaces placeholders, and returns a Buffer.
 */
function buildPluginZip(sendsignUrl: string, apiKey: string): Buffer {
  const pluginDir = path.join(TEMPLATE_DIR, '.claude-plugin');

  if (!fs.existsSync(pluginDir)) {
    throw new Error('Plugin template directory not found');
  }

  const zip = new AdmZip();

  // Walk the template directory recursively and add all files
  function addDirectory(dirPath: string, zipPrefix: string): void {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const zipPath = `${zipPrefix}/${entry.name}`;

      if (entry.isDirectory()) {
        addDirectory(fullPath, zipPath);
      } else if (entry.isFile()) {
        let content = fs.readFileSync(fullPath);

        // Replace placeholders in text files (.json, .md)
        if (entry.name.endsWith('.json') || entry.name.endsWith('.md')) {
          let text = content.toString('utf-8');
          text = text.replace(/\{\{SENDSIGN_URL\}\}/g, sendsignUrl);
          text = text.replace(/\{\{API_KEY\}\}/g, apiKey);
          content = Buffer.from(text, 'utf-8');
        }

        zip.addFile(zipPath, content);
      }
    }
  }

  addDirectory(pluginDir, '.claude-plugin');
  return zip.toBuffer();
}

/**
 * GET /api/plugin/cowork
 *
 * Generates a personalized Cowork plugin zip for the authenticated user.
 * Requires authentication (Bearer API key + tenant context).
 *
 * The zip contains a .claude-plugin directory with:
 *   - plugin.json (metadata)
 *   - .mcp.json (MCP server config with the user's API key and tenant URL)
 *   - commands/ (slash commands for Claude)
 *   - skills/ (background knowledge for Claude)
 *
 * The tenant's subdomain URL is used as the SendSign URL:
 *   e.g., https://acme.sendsign.dev
 *
 * The API key from the Authorization header is baked into .mcp.json.
 */
router.get('/cowork', authenticate, tenantContext, async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract the API key from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authorization header with Bearer API key required',
      });
      return;
    }
    const apiKey = authHeader.slice(7);

    // Build the tenant-specific SendSign URL
    const tenant = getTenant(req);
    const baseDomain = process.env.SENDSIGN_BASE_DOMAIN || 'sendsign.dev';
    const baseUrl = process.env.BASE_URL
      || process.env.SENDSIGN_BASE_URL
      || `http://localhost:${process.env.PORT || 3000}`;

    // Use the tenant's subdomain URL if we have a tenant slug,
    // otherwise fall back to the main instance URL
    const sendsignUrl = tenant?.slug && tenant.slug !== 'default'
      ? `https://${tenant.slug}.${baseDomain}`
      : baseUrl;

    const zipBuffer = buildPluginZip(sendsignUrl, apiKey);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="sendsign-cowork-plugin.zip"',
      'Content-Length': String(zipBuffer.length),
    });
    res.send(zipBuffer);
  } catch (error) {
    console.error('Plugin download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate plugin zip',
    });
  }
});

/**
 * GET /api/plugin/download
 *
 * Legacy/convenience endpoint — generates plugin zip from query param or header.
 * Does NOT require the full authenticate + tenantContext middleware chain.
 * Useful for simple integrations and the dashboard download button.
 */
router.get('/download', async (req: Request, res: Response): Promise<void> => {
  try {
    let apiKey = req.query.apiKey as string | undefined;
    if (!apiKey) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.slice(7);
      }
    }

    if (!apiKey) {
      res.status(400).json({
        success: false,
        error: 'API key required. Pass as ?apiKey= or via Authorization header.',
      });
      return;
    }

    const baseUrl = process.env.BASE_URL
      || process.env.SENDSIGN_BASE_URL
      || `http://localhost:${process.env.PORT || 3000}`;

    const zipBuffer = buildPluginZip(baseUrl, apiKey);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="sendsign-cowork-plugin.zip"',
      'Content-Length': String(zipBuffer.length),
    });
    res.send(zipBuffer);
  } catch (error) {
    console.error('Plugin download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate plugin zip',
    });
  }
});

/**
 * GET /api/plugin/cowork
 *
 * Alias for /api/plugin/download for convenience.
 * Requires authentication (API key via query param or Authorization header).
 */
router.get('/cowork', async (req: Request, res: Response): Promise<void> => {
  // Forward to download handler
  return router.handle({ ...req, url: '/download', path: '/download' } as any, res, () => {});
});

/**
 * GET /api/plugin/info
 *
 * Returns plugin metadata (no auth required).
 * Useful for the dashboard to show plugin information before downloading.
 */
router.get('/info', (_req: Request, res: Response): void => {
  const pluginJsonPath = path.join(TEMPLATE_DIR, '.claude-plugin', 'plugin.json');

  let pluginMeta = {
    name: 'SendSign E-Signature',
    description: 'Send documents for legally-binding electronic signature directly from Cowork',
    version: '1.0.0',
    author: 'SendSign',
    homepage: 'https://sendsign.dev',
  };

  if (fs.existsSync(pluginJsonPath)) {
    try {
      pluginMeta = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
    } catch {
      // Use defaults
    }
  }

  res.json({
    success: true,
    data: {
      plugin: pluginMeta,
      download: {
        authenticated: 'GET /api/plugin/cowork (uses your API key + tenant URL)',
        simple: 'GET /api/plugin/download?apiKey=YOUR_KEY',
      },
      instructions: {
        step1: 'Download the plugin zip from GET /api/plugin/cowork',
        step2: 'Unzip to get the .claude-plugin folder',
        step3: 'Drag the folder into your Claude Cowork project',
        step4: 'Claude now has access to SendSign tools',
      },
      commands: [
        { name: 'send-for-signature', description: 'Send a document for electronic signature' },
        { name: 'check-status', description: 'Check the signing status of sent documents' },
        { name: 'create-template', description: 'Create a reusable signing template' },
      ],
      tools: [
        'create_envelope',
        'send_envelope',
        'check_status',
        'list_envelopes',
        'void_envelope',
        'create_template',
        'list_templates',
        'use_template',
        'send_reminder',
        'get_audit_trail',
        'download_signed',
        'bulk_send',
        'get_analytics',
        'create_from_legal_review',
      ],
    },
  });
});

export default router;
