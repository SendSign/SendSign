/**
 * Admin analytics, reporting, and user management endpoints.
 */

import express from 'express';
import { getDb } from '../../db/connection.js';
import { envelopes, signers, auditEvents, users, templates, brandingConfigs } from '../../db/schema.js';
import { sql, desc, gte, and, eq } from 'drizzle-orm';
import { requireRole, requirePermission } from '../middleware/rbac.js';

const router = express.Router();

/**
 * GET /api/admin/analytics
 * Get signing analytics and statistics.
 * Enhanced with filters (Step 30): ?userId=uuid&dateFrom=ISO&dateTo=ISO&groupBy=user|day|week|month
 */
router.get('/analytics', async (req, res) => {
  const period = (req.query.period as string) ?? '30d';
  const userId = req.query.userId as string | undefined;
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
  const groupBy = (req.query.groupBy as string) ?? 'day';
  
  const db = getDb();

  // Calculate date range
  const now = new Date();
  let startDate: Date;
  let endDate: Date = dateTo ?? now;
  
  if (dateFrom) {
    startDate = dateFrom;
  } else {
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date(0); // Unix epoch
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  // Build filter conditions
  const filters = [gte(envelopes.createdAt, startDate)];
  if (dateTo) {
    filters.push(sql`${envelopes.createdAt} <= ${endDate}`);
  }
  if (userId) {
    filters.push(eq(envelopes.createdBy, userId));
  }

  // Summary stats
  const allEnvelopes = await db.select().from(envelopes).where(and(...filters));
  
  const totalEnvelopes = allEnvelopes.length;
  const completed = allEnvelopes.filter((e) => e.status === 'completed').length;
  const pending = allEnvelopes.filter((e) => e.status === 'pending' || e.status === 'sent').length;
  const voided = allEnvelopes.filter((e) => e.status === 'voided').length;
  const completionRate = totalEnvelopes > 0 ? completed / totalEnvelopes : 0;

  // Average time to complete (in days)
  const completedEnvelopes = allEnvelopes.filter((e) => e.status === 'completed' && e.completedAt && e.sentAt);
  const totalCompletionTime = completedEnvelopes.reduce((sum, e) => {
    if (!e.completedAt || !e.sentAt) return sum;
    const diff = e.completedAt.getTime() - e.sentAt.getTime();
    return sum + diff;
  }, 0);
  const avgTimeToComplete = completedEnvelopes.length > 0
    ? (totalCompletionTime / completedEnvelopes.length / (1000 * 60 * 60 * 24)).toFixed(1) + ' days'
    : 'N/A';

  // Daily counts (last 30 days for chart)
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentEnvelopes = await db.select().from(envelopes).where(gte(envelopes.createdAt, last30Days));
  
  const dailyCounts: Array<{ date: string; sent: number; completed: number }> = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    
    const sent = recentEnvelopes.filter((e) => {
      const sentDate = e.sentAt?.toISOString().split('T')[0];
      return sentDate === dateStr;
    }).length;
    
    const completed = recentEnvelopes.filter((e) => {
      const completedDate = e.completedAt?.toISOString().split('T')[0];
      return completedDate === dateStr;
    }).length;
    
    dailyCounts.unshift({ date: dateStr, sent, completed });
  }

  // Status breakdown
  const statusBreakdown = [
    { status: 'completed', count: completed },
    { status: 'pending', count: pending },
    { status: 'voided', count: voided },
    { status: 'draft', count: allEnvelopes.filter((e) => e.status === 'draft').length },
  ];

  // Recent events (last 20)
  const recentEvents = await db
    .select()
    .from(auditEvents)
    .where(gte(auditEvents.timestamp, startDate))
    .orderBy(desc(auditEvents.timestamp))
    .limit(20);

  const recentEventsFormatted = recentEvents.map((event) => ({
    envelopeId: event.envelopeId,
    action: event.eventType,
    actor: event.actorId ?? 'System',
    timestamp: event.timestamp.toISOString(),
    metadata: event.metadata,
  }));

  res.json({
    success: true,
    data: {
      summary: {
        totalEnvelopes,
        completed,
        pending,
        voided,
        completionRate: Math.round(completionRate * 100) / 100,
        avgTimeToComplete,
      },
      dailyCounts,
      statusBreakdown,
      recentEvents: recentEventsFormatted,
    },
  });
});

// ─── Enhanced Analytics (Step 30) ──────────────────────────────

/**
 * GET /api/admin/analytics/users
 * Per-user analytics breakdown.
 */
router.get('/analytics/users', async (req, res) => {
  const db = getDb();
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : new Date(0);
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : new Date();

  // Get all users
  const allUsers = await db.select().from(users);

  const userStats = [];

  for (const user of allUsers) {
    // Get envelopes created by this user
    const userEnvelopes = await db
      .select()
      .from(envelopes)
      .where(
        and(
          eq(envelopes.createdBy, user.id),
          gte(envelopes.createdAt, dateFrom),
          sql`${envelopes.createdAt} <= ${dateTo}`,
        ),
      );

    const sent = userEnvelopes.length;
    const completed = userEnvelopes.filter((e) => e.status === 'completed').length;

    // Calculate average turnaround time
    const completedWithTimes = userEnvelopes.filter(
      (e) => e.status === 'completed' && e.sentAt && e.completedAt,
    );
    let avgTurnaround = 'N/A';
    if (completedWithTimes.length > 0) {
      const totalTime = completedWithTimes.reduce((sum, e) => {
        if (!e.sentAt || !e.completedAt) return sum;
        return sum + (e.completedAt.getTime() - e.sentAt.getTime());
      }, 0);
      const avgMs = totalTime / completedWithTimes.length;
      const hours = (avgMs / (1000 * 60 * 60)).toFixed(1);
      avgTurnaround = `${hours}h`;
    }

    userStats.push({
      userId: user.id,
      name: user.name || user.email,
      email: user.email,
      sent,
      completed,
      avgTurnaround,
    });
  }

  // Sort by sent count descending
  userStats.sort((a, b) => b.sent - a.sent);

  res.json({ success: true, data: userStats });
});

/**
 * GET /api/admin/analytics/templates
 * Per-template usage statistics.
 */
router.get('/analytics/templates', async (req, res) => {
  const db = getDb();
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : new Date(0);
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : new Date();

  // Get all templates
  const allTemplates = await db.select().from(templates);

  const templateStats = [];

  for (const template of allTemplates) {
    // Get envelopes created from this template
    // Templates create envelopes with metadata.templateId or similar
    const templateEnvelopes = await db
      .select()
      .from(envelopes)
      .where(
        and(
          gte(envelopes.createdAt, dateFrom),
          sql`${envelopes.createdAt} <= ${dateTo}`,
          // Check if metadata contains this templateId
          sql`${envelopes.metadata}::jsonb @> ${JSON.stringify({ templateId: template.id })}::jsonb`,
        ),
      );

    const timesUsed = templateEnvelopes.length;
    const completed = templateEnvelopes.filter((e) => e.status === 'completed').length;
    const completionRate = timesUsed > 0 ? `${Math.round((completed / timesUsed) * 100)}%` : 'N/A';

    // Calculate average turnaround
    const completedWithTimes = templateEnvelopes.filter(
      (e) => e.status === 'completed' && e.sentAt && e.completedAt,
    );
    let avgTurnaround = 'N/A';
    if (completedWithTimes.length > 0) {
      const totalTime = completedWithTimes.reduce((sum, e) => {
        if (!e.sentAt || !e.completedAt) return sum;
        return sum + (e.completedAt.getTime() - e.sentAt.getTime());
      }, 0);
      const avgMs = totalTime / completedWithTimes.length;
      const hours = (avgMs / (1000 * 60 * 60)).toFixed(1);
      avgTurnaround = `${hours}h`;
    }

    templateStats.push({
      templateId: template.id,
      name: template.name,
      timesUsed,
      completionRate,
      avgTurnaround,
    });
  }

  // Sort by times used descending
  templateStats.sort((a, b) => b.timesUsed - a.timesUsed);

  res.json({ success: true, data: templateStats });
});

/**
 * GET /api/admin/analytics/export
 * Export analytics as CSV or PDF.
 */
router.get('/analytics/export', async (req, res) => {
  const format = (req.query.format as string) ?? 'csv';
  const type = (req.query.type as string) ?? 'summary'; // summary | users | templates
  const db = getDb();

  try {
    if (format === 'csv') {
      // Generate CSV export
      let csvContent = '';

      if (type === 'users') {
        // Export user stats
        const allUsers = await db.select().from(users);
        csvContent = 'User ID,Name,Email,Envelopes Sent,Completed,Avg Turnaround\n';

        for (const user of allUsers) {
          const userEnvelopes = await db
            .select()
            .from(envelopes)
            .where(eq(envelopes.createdBy, user.id));

          const sent = userEnvelopes.length;
          const completed = userEnvelopes.filter((e) => e.status === 'completed').length;

          csvContent += `${user.id},"${user.name || 'N/A'}",${user.email},${sent},${completed},N/A\n`;
        }
      } else if (type === 'templates') {
        // Export template stats
        const allTemplates = await db.select().from(templates);
        csvContent = 'Template ID,Name,Times Used,Completion Rate,Avg Turnaround\n';

        for (const template of allTemplates) {
          const templateEnvelopes = await db
            .select()
            .from(envelopes)
            .where(
              sql`${envelopes.metadata}::jsonb @> ${JSON.stringify({ templateId: template.id })}::jsonb`,
            );

          const timesUsed = templateEnvelopes.length;
          const completed = templateEnvelopes.filter((e) => e.status === 'completed').length;
          const completionRate = timesUsed > 0 ? `${Math.round((completed / timesUsed) * 100)}%` : '0%';

          csvContent += `${template.id},"${template.name}",${timesUsed},${completionRate},N/A\n`;
        }
      } else {
        // Summary export
        const allEnvelopes = await db.select().from(envelopes);
        csvContent = 'Envelope ID,Subject,Status,Created,Completed\n';

        for (const envelope of allEnvelopes) {
          csvContent += `${envelope.id},"${envelope.subject}",${envelope.status},${envelope.createdAt.toISOString()},${envelope.completedAt?.toISOString() || 'N/A'}\n`;
        }
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=coseal-analytics-${type}-${Date.now()}.csv`);
      res.send(csvContent);
    } else if (format === 'pdf') {
      // For PDF export, return a simple message (full PDF generation would require pdfkit or similar)
      res.status(501).json({
        success: false,
        error: 'PDF export not yet implemented. Use format=csv for CSV export.',
      });
    } else {
      res.status(400).json({ success: false, error: 'Invalid format. Use csv or pdf.' });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Export failed: ${(error as Error).message}`,
    });
  }
});

// ─── User Management (RBAC — Step 27) ──────────────────────────

/**
 * GET /api/admin/users
 * List all users (admin only).
 */
router.get('/users', requireRole('admin'), async (req, res) => {
  const db = getDb();

  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      organizationId: users.organizationId,
      ssoSubject: users.ssoSubject,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  res.json({ success: true, data: allUsers });
});

/**
 * POST /api/admin/users
 * Create a new user (admin only).
 */
router.post('/users', requireRole('admin'), async (req, res) => {
  const { email, name, role, organizationId } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'email is required' });
  }

  const validRoles = ['admin', 'sender', 'viewer'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
    });
  }

  const db = getDb();

  // Check for existing user
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return res.status(409).json({ success: false, error: 'User with this email already exists' });
  }

  const [newUser] = await db
    .insert(users)
    .values({
      email,
      name: name || email.split('@')[0],
      role: role || 'sender',
      organizationId: organizationId || null,
      isActive: true,
    })
    .returning();

  res.status(201).json({ success: true, data: newUser });
});

/**
 * PUT /api/admin/users/:id
 * Update a user's role or active status (admin only).
 */
router.put('/users/:id', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { name, role, isActive } = req.body;

  const validRoles = ['admin', 'sender', 'viewer'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
    });
  }

  const db = getDb();

  const [existingUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existingUser) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updateData.name = name;
  if (role !== undefined) updateData.role = role;
  if (isActive !== undefined) updateData.isActive = isActive;

  await db.update(users).set(updateData).where(eq(users.id, id));

  const [updatedUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);

  res.json({ success: true, data: updatedUser });
});

/**
 * DELETE /api/admin/users/:id
 * Deactivate a user (admin only, soft delete).
 */
router.delete('/users/:id', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const [existingUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existingUser) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Prevent deactivating yourself
  if (req.user && req.user.id === id) {
    return res.status(400).json({
      success: false,
      error: 'Cannot deactivate your own account',
    });
  }

  // Soft delete — set isActive to false
  await db
    .update(users)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(users.id, id));

  res.json({ success: true, data: { message: 'User deactivated' } });
});

/**
 * GET /api/admin/users/:id
 * Get a specific user (admin only).
 */
router.get('/users/:id', requireRole('admin'), async (req, res) => {
  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      organizationId: users.organizationId,
      ssoSubject: users.ssoSubject,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, req.params.id))
    .limit(1);

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  res.json({ success: true, data: user });
});

// ─── Branding / White-Label (Step 32) ──────────────────────────

/**
 * Check if branding entitlement is active.
 */
function checkBrandingEntitlement(): boolean {
  return !!process.env.COSEAL_BRANDING_ENTITLEMENT;
}

/**
 * GET /api/admin/branding
 * Get the current branding configuration.
 */
router.get('/branding', async (req, res) => {
  const db = getDb();

  // Get branding config for the organization (or default)
  const configs = await db.select().from(brandingConfigs).limit(1);

  if (configs.length === 0) {
    // Return default branding
    return res.json({
      success: true,
      data: {
        primaryColor: '#2563EB',
        secondaryColor: '#1E40AF',
        accentColor: '#3B82F6',
        companyName: 'CoSeal',
        emailFooter: null,
        signingHeader: null,
        logoUrl: null,
        faviconUrl: null,
        customCss: null,
        isDefault: true,
        entitlementActive: checkBrandingEntitlement(),
      },
    });
  }

  const config = configs[0];
  res.json({
    success: true,
    data: {
      id: config.id,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
      accentColor: config.accentColor,
      companyName: config.companyName || 'CoSeal',
      emailFooter: config.emailFooter,
      signingHeader: config.signingHeader,
      logoUrl: config.logoUrl,
      logoData: config.logoData ? '(base64 data present)' : null,
      faviconUrl: config.faviconUrl,
      customCss: config.customCss,
      isDefault: false,
      entitlementActive: checkBrandingEntitlement(),
    },
  });
});

/**
 * PUT /api/admin/branding
 * Update branding configuration (requires entitlement).
 */
router.put('/branding', requireRole('admin'), async (req, res) => {
  if (!checkBrandingEntitlement()) {
    return res.status(403).json({
      success: false,
      error: 'Branding customization requires the COSEAL_BRANDING_ENTITLEMENT key. Contact sales.',
    });
  }

  const {
    primaryColor,
    secondaryColor,
    accentColor,
    companyName,
    emailFooter,
    signingHeader,
    logoUrl,
    logoData,
    faviconUrl,
    customCss,
  } = req.body;

  // Validate colors are valid hex
  const hexPattern = /^#[0-9A-Fa-f]{6}$/;
  if (primaryColor && !hexPattern.test(primaryColor)) {
    return res.status(400).json({ success: false, error: 'primaryColor must be a valid hex color (e.g., #2563EB)' });
  }
  if (secondaryColor && !hexPattern.test(secondaryColor)) {
    return res.status(400).json({ success: false, error: 'secondaryColor must be a valid hex color' });
  }
  if (accentColor && !hexPattern.test(accentColor)) {
    return res.status(400).json({ success: false, error: 'accentColor must be a valid hex color' });
  }

  // Validate logo data size (if base64, max ~500KB)
  if (logoData && Buffer.from(logoData, 'base64').length > 500 * 1024) {
    return res.status(400).json({ success: false, error: 'Logo must be under 500KB' });
  }

  // Sanitize custom CSS (basic — strip script tags)
  let sanitizedCss = customCss;
  if (customCss) {
    sanitizedCss = customCss
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/expression\(/gi, '')
      .replace(/@import/gi, '');
  }

  const db = getDb();

  // Check if config exists
  const existing = await db.select().from(brandingConfigs).limit(1);

  const configData = {
    primaryColor: primaryColor || '#2563EB',
    secondaryColor: secondaryColor || '#1E40AF',
    accentColor: accentColor || '#3B82F6',
    companyName: companyName || null,
    emailFooter: emailFooter || null,
    signingHeader: signingHeader || null,
    logoUrl: logoUrl || null,
    logoData: logoData || null,
    faviconUrl: faviconUrl || null,
    customCss: sanitizedCss || null,
    updatedAt: new Date(),
  };

  let config;
  if (existing.length > 0) {
    [config] = await db
      .update(brandingConfigs)
      .set(configData)
      .where(eq(brandingConfigs.id, existing[0].id))
      .returning();
  } else {
    [config] = await db
      .insert(brandingConfigs)
      .values(configData)
      .returning();
  }

  res.json({ success: true, data: config });
});

/**
 * DELETE /api/admin/branding
 * Reset branding to CoSeal defaults.
 */
router.delete('/branding', requireRole('admin'), async (req, res) => {
  if (!checkBrandingEntitlement()) {
    return res.status(403).json({
      success: false,
      error: 'Branding customization requires the COSEAL_BRANDING_ENTITLEMENT key.',
    });
  }

  const db = getDb();
  await db.delete(brandingConfigs);

  res.json({ success: true, data: { message: 'Branding reset to defaults' } });
});

export default router;
