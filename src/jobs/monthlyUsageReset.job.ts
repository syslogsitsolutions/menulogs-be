/**
 * Monthly Usage Reset Job
 * 
 * Resets monthly upload limits for all locations.
 * Runs daily at midnight to check and reset limits for locations
 * whose reset date has arrived.
 * 
 * @module jobs/monthlyUsageReset
 */

import cron from 'node-cron';
import prisma from '../config/database';
import usageTrackingService from '../services/usageTracking.service';
import { logger } from '../utils/logger.util';

/**
 * Run monthly usage reset for all locations that need it
 */
async function runMonthlyUsageReset(): Promise<void> {
  try {
    logger.info('Starting monthly usage reset job...');

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Find all locations that need reset
    // Reset if monthlyUploadResetDate is null or has passed
    const locationsToReset = await prisma.location.findMany({
      where: {
        OR: [
          { monthlyUploadResetDate: null },
          { monthlyUploadResetDate: { lte: now } },
        ],
      },
      select: {
        id: true,
        name: true,
        monthlyUploadResetDate: true,
      },
    });

    logger.info(`Found ${locationsToReset.length} location(s) to reset`);

    let successCount = 0;
    let errorCount = 0;

    for (const location of locationsToReset) {
      try {
        await usageTrackingService.resetMonthlyLimits(location.id);
        successCount++;
        logger.debug(`Reset monthly limits for location: ${location.id} (${location.name})`);
      } catch (error) {
        errorCount++;
        logger.error(`Failed to reset monthly limits for location ${location.id}:`, error);
      }
    }

    logger.info('Monthly usage reset job completed', {
      total: locationsToReset.length,
      success: successCount,
      errors: errorCount,
    });
  } catch (error) {
    logger.error('Monthly usage reset job failed:', error);
  }
}

/**
 * Initialize the monthly usage reset cron job
 * Runs daily at midnight (00:00)
 */
export function initializeMonthlyUsageResetJob(): void {
  // Run daily at midnight (00:00:00)
  // Cron format: minute hour day month dayOfWeek
  // '0 0 * * *' = every day at 00:00
  cron.schedule('0 0 * * *', async () => {
    await runMonthlyUsageReset();
  });

  logger.info('✅ Monthly usage reset job scheduled (runs daily at midnight)');

  // Run immediately on startup (for testing/debugging)
  // Comment out in production if you only want it to run at scheduled times
  if (process.env.NODE_ENV === 'development') {
    logger.info('Running monthly usage reset job immediately (development mode)');
    runMonthlyUsageReset().catch((error) => {
      logger.error('Initial monthly usage reset failed:', error);
    });
  }
}

/**
 * Manually trigger monthly usage reset (for testing/admin)
 */
export async function triggerMonthlyUsageReset(): Promise<void> {
  await runMonthlyUsageReset();
}

