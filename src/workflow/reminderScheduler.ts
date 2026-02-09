import cron from 'node-cron';
import { and, eq, lt, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { signers, envelopes, auditEvents } from '../db/schema.js';
import { logEvent } from '../audit/auditLogger.js';

const DEFAULT_REMINDER_INTERVAL_HOURS = 48;

function getReminderIntervalHours(): number {
  const envVal = process.env.REMINDER_INTERVAL_HOURS;
  return envVal ? parseInt(envVal, 10) : DEFAULT_REMINDER_INTERVAL_HOURS;
}

/**
 * Find signers who need a reminder.
 * Criteria:
 * - Status is 'sent' (notified but hasn't signed)
 * - Last reminder was more than REMINDER_INTERVAL_HOURS ago
 * - Envelope is still active (sent or in_progress)
 */
export async function findSignersNeedingReminder(): Promise<
  Array<{
    signerId: string;
    signerName: string;
    signerEmail: string;
    envelopeId: string;
    envelopeSubject: string;
  }>
> {
  const db = getDb();
  const intervalHours = getReminderIntervalHours();
  const cutoff = new Date(Date.now() - intervalHours * 60 * 60 * 1000);

  // Find pending/sent signers whose envelopes are active
  const results = await db
    .select({
      signerId: signers.id,
      signerName: signers.name,
      signerEmail: signers.email,
      envelopeId: signers.envelopeId,
      envelopeSubject: envelopes.subject,
    })
    .from(signers)
    .innerJoin(envelopes, eq(signers.envelopeId, envelopes.id))
    .where(
      and(
        eq(signers.status, 'sent'),
        sql`${envelopes.status} IN ('sent', 'in_progress')`,
      ),
    );

  // Filter out signers who were reminded recently
  const needReminder = [];
  for (const result of results) {
    // Check last reminder event
    const lastReminder = await db
      .select({ createdAt: auditEvents.createdAt })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.envelopeId, result.envelopeId),
          eq(auditEvents.signerId, result.signerId),
          eq(auditEvents.eventType, 'reminded'),
        ),
      )
      .orderBy(sql`${auditEvents.createdAt} DESC`)
      .limit(1);

    if (!lastReminder.length || lastReminder[0].createdAt < cutoff) {
      needReminder.push(result);
    }
  }

  return needReminder;
}

/**
 * Send reminders to signers who need them.
 * Returns the number of reminders sent.
 */
export async function sendReminders(): Promise<number> {
  const signersToRemind = await findSignersNeedingReminder();
  let count = 0;

  for (const signer of signersToRemind) {
    try {
      // In production, this would trigger an actual email/SMS notification
      // For now, we just log the audit event
      await logEvent({
        envelopeId: signer.envelopeId,
        signerId: signer.signerId,
        eventType: 'reminded',
        eventData: {
          channel: 'email',
          recipientEmail: signer.signerEmail,
        },
      });

      count++;
    } catch (error) {
      console.error(`Failed to send reminder to ${signer.signerEmail}:`, error);
    }
  }

  return count;
}

let cronJob: cron.ScheduledTask | null = null;

/**
 * Schedule the reminder cron job (runs every hour).
 */
export function scheduleReminders(): void {
  if (cronJob) return; // Already scheduled

  cronJob = cron.schedule('0 * * * *', async () => {
    try {
      const count = await sendReminders();
      if (count > 0) {
        console.log(`Sent ${count} signing reminders`);
      }
    } catch (error) {
      console.error('Reminder scheduler error:', error);
    }
  });

  console.log('Reminder scheduler started (runs every hour)');
}

/**
 * Stop the reminder cron job.
 */
export function stopReminders(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}
