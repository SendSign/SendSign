import cron from 'node-cron';
import { and, lt, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { envelopes } from '../db/schema.js';
import { logEvent } from '../audit/auditLogger.js';

/**
 * Find envelopes that have expired (past their expires_at date)
 * and haven't been completed or voided yet.
 */
export async function findExpiredEnvelopes(): Promise<
  Array<{ id: string; subject: string; expiresAt: Date | null }>
> {
  const db = getDb();
  const now = new Date();

  const expired = await db
    .select({
      id: envelopes.id,
      subject: envelopes.subject,
      expiresAt: envelopes.expiresAt,
    })
    .from(envelopes)
    .where(
      and(
        lt(envelopes.expiresAt, now),
        sql`${envelopes.status} NOT IN ('completed', 'voided', 'expired')`,
      ),
    );

  return expired;
}

/**
 * Expire outstanding envelopes and log audit events.
 * Returns the number of expired envelopes.
 */
export async function expireEnvelopes(): Promise<number> {
  const expired = await findExpiredEnvelopes();
  const db = getDb();
  let count = 0;

  for (const env of expired) {
    try {
      await db
        .update(envelopes)
        .set({
          status: 'expired',
          updatedAt: new Date(),
        })
        .where(sql`${envelopes.id} = ${env.id}`);

      await logEvent({
        envelopeId: env.id,
        eventType: 'expired',
        eventData: {
          reason: 'Envelope exceeded expiration date',
          expiresAt: env.expiresAt?.toISOString(),
        },
      });

      count++;
    } catch (error) {
      console.error(`Failed to expire envelope ${env.id}:`, error);
    }
  }

  return count;
}

let cronJob: cron.ScheduledTask | null = null;

/**
 * Schedule the expiry check cron job (runs every hour).
 */
export function scheduleExpiryCheck(): void {
  if (cronJob) return;

  cronJob = cron.schedule('30 * * * *', async () => {
    try {
      const count = await expireEnvelopes();
      if (count > 0) {
        console.log(`Expired ${count} envelopes`);
      }
    } catch (error) {
      console.error('Expiry manager error:', error);
    }
  });

  console.log('Expiry check scheduler started (runs every hour at :30)');
}

/**
 * Stop the expiry check cron job.
 */
export function stopExpiryCheck(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}
