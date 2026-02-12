import { Router } from 'express';
import { getDb } from '../../db/connection.js';
import { getPool } from '../../db/connection.js';
import { tenants, envelopes } from '../../db/schema.js';
import { count, gte, sql } from 'drizzle-orm';
import { controlAuth } from '../middleware/controlAuth.js';

const router = Router();

/**
 * GET /health
 * Basic liveness probe — no auth required.
 * Used by load balancers and orchestrators.
 */
router.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /health/ready
 * Readiness probe — checks database connectivity.
 * No auth required — used by load balancers.
 */
router.get('/ready', async (_req, res) => {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    res.json({ status: 'ready', database: 'connected' });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /health/detailed
 * Full system status — requires controlAuth.
 * Includes tenant count, envelope count today, connection pool stats.
 */
router.get('/detailed', controlAuth, async (_req, res) => {
  try {
    const db = getDb();
    const pool = getPool();

    // Count tenants
    const [tenantResult] = await db
      .select({ count: count() })
      .from(tenants);

    // Count envelopes created today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [envelopeResult] = await db
      .select({ count: count() })
      .from(envelopes)
      .where(gte(envelopes.createdAt, todayStart));

    // Connection pool stats
    const poolStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      tenants: {
        total: tenantResult?.count ?? 0,
      },
      envelopes: {
        today: envelopeResult?.count ?? 0,
      },
      database: {
        status: 'connected',
        pool: poolStats,
      },
      node: {
        version: process.version,
        env: process.env.NODE_ENV || 'development',
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
