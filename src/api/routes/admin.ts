/**
 * Admin analytics, reporting, and user management endpoints.
 */

import express from 'express';
import { getDb } from '../../db/connection.js';
import { envelopes, signers, auditEvents, users } from '../../db/schema.js';
import { sql, desc, gte, and, eq } from 'drizzle-orm';
import { requireRole, requirePermission } from '../middleware/rbac.js';

const router = express.Router();

/**
 * GET /api/admin/analytics
 * Get signing analytics and statistics.
 */
router.get('/analytics', async (req, res) => {
  const period = (req.query.period as string) ?? '30d';
  const db = getDb();

  // Calculate date range
  const now = new Date();
  let startDate: Date;
  
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

  // Summary stats
  const allEnvelopes = await db.select().from(envelopes).where(gte(envelopes.createdAt, startDate));
  
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

export default router;
