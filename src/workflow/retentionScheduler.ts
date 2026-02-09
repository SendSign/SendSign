/**
 * Retention policy processing scheduler.
 * Runs daily at 2 AM to process expired documents.
 */

import { processRetention } from '../storage/retentionManager.js';

const RETENTION_HOUR = 2; // 2 AM

/**
 * Schedule retention processing to run daily at 2 AM.
 */
export function scheduleRetentionProcessing(): void {
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date();
    next.setHours(RETENTION_HOUR, 0, 0, 0);

    // If 2 AM has already passed today, schedule for tomorrow
    if (now >= next) {
      next.setDate(next.getDate() + 1);
    }

    const msUntilNext = next.getTime() - now.getTime();

    console.log(`📅 Next retention processing scheduled for: ${next.toISOString()}`);

    setTimeout(async () => {
      await runRetentionProcessing();
      scheduleNext(); // Schedule the next run
    }, msUntilNext);
  };

  scheduleNext();
}

/**
 * Run retention processing immediately.
 */
async function runRetentionProcessing(): Promise<void> {
  console.log('🗑️  Running retention policy processing...');

  try {
    const report = await processRetention();
    console.log(`✓ Retention processed:`, {
      total: report.total,
      expired: report.expired,
      expiringSoon: report.expiringSoon,
      deleted: report.deleted,
    });
  } catch (error) {
    console.error('❌ Retention processing failed:', error);
  }
}
