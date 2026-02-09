/**
 * Delay Processor
 * Processes delayed signers and sends notifications when cooling-off periods end.
 * Step 26 - Delayed Routing
 */

import { getDb } from '../db/index.js';
import { signers, envelopes } from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';
import { logEvent } from '../audit/index.js';

/**
 * Process delayed signers whose delay period has expired.
 * Called by hourly cron job.
 */
export async function processDelayedSigners(): Promise<number> {
  const db = getDb();
  const now = new Date();

  // Find signers where status = 'delayed' and delayed_until <= now
  const delayedSigners = await db
    .select()
    .from(signers)
    .where(and(eq(signers.status, 'delayed'), lte(signers.delayedUntil, now)));

  console.log(`Found ${delayedSigners.length} delayed signers ready to be notified`);

  for (const signer of delayedSigners) {
    try {
      // Update signer status to 'notified'
      await db
        .update(signers)
        .set({
          status: 'notified',
          delayedUntil: null,
        })
        .where(eq(signers.id, signer.id));

      // Log audit event
      await logEvent({
        envelopeId: signer.envelopeId,
        signerId: signer.id,
        eventType: 'delay_completed',
        eventData: {
          originalDelayUntil: signer.delayedUntil,
          notifiedAt: now.toISOString(),
        },
      });

      // Send signing notification
      const { sendSigningNotification } = await import('../notifications/index.js');
      const [envelope] = await db
        .select()
        .from(envelopes)
        .where(eq(envelopes.id, signer.envelopeId))
        .limit(1);

      if (envelope) {
        await sendSigningNotification({
          signer: signer as any,
          envelope: envelope as any,
          signingUrl: `${process.env.BASE_URL}/sign/${signer.signingToken}`,
        });

        console.log(`Sent delayed notification to ${signer.email} for envelope ${envelope.id}`);
      }
    } catch (error) {
      console.error(`Failed to process delayed signer ${signer.id}:`, error);
      // Continue with other signers even if one fails
    }
  }

  return delayedSigners.length;
}

/**
 * Update signer to delayed status.
 * Called after a previous signer completes and routing rules dictate a delay.
 */
export async function setSignerDelayed(
  signerId: string,
  delayedUntil: Date,
  reason: string = 'routing_rule',
): Promise<void> {
  const db = getDb();

  const [signer] = await db.select().from(signers).where(eq(signers.id, signerId)).limit(1);

  if (!signer) {
    throw new Error(`Signer ${signerId} not found`);
  }

  // Update signer status
  await db
    .update(signers)
    .set({
      status: 'delayed',
      delayedUntil,
    })
    .where(eq(signers.id, signerId));

  // Log audit event
  await logEvent({
    envelopeId: signer.envelopeId,
    signerId,
    eventType: 'delayed',
    eventData: {
      until: delayedUntil.toISOString(),
      reason,
    },
  });

  console.log(
    `Signer ${signer.email} delayed until ${delayedUntil.toISOString()} (reason: ${reason})`,
  );
}
