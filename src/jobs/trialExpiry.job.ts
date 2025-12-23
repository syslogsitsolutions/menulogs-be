/**
 * Trial Expiry Check Job
 * 
 * Checks for locations with expiring/expired trials and sends notifications.
 * Runs daily at midnight to process trial expirations.
 * 
 * @module jobs/trialExpiry
 */

import cron from 'node-cron';
import prisma from '../config/database';
import notificationService from '../services/notification.service';
import { logger } from '../utils/logger.util';

/**
 * Check and process trial expirations
 */
async function checkTrialExpirations(): Promise<void> {
  try {
    logger.info('Starting trial expiry check job...');

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Find locations with trials ending in 3 days
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    const trialsEndingIn3Days = await prisma.location.findMany({
      where: {
        trialEndsAt: {
          gte: now,
          lte: threeDaysFromNow,
        },
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'TRIAL',
      },
      include: {
        business: {
          include: {
            owner: {
              select: { email: true, name: true },
            },
          },
        },
      },
    });

    // Find locations with trials ending in 1 day
    const oneDayFromNow = new Date();
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
    oneDayFromNow.setHours(23, 59, 59, 999);

    const trialsEndingIn1Day = await prisma.location.findMany({
      where: {
        trialEndsAt: {
          gte: now,
          lte: oneDayFromNow,
        },
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'TRIAL',
      },
      include: {
        business: {
          include: {
            owner: {
              select: { email: true, name: true },
            },
          },
        },
      },
    });

    // Find locations with expired trials
    const expiredTrials = await prisma.location.findMany({
      where: {
        trialEndsAt: {
          lt: now,
        },
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'TRIAL',
      },
      include: {
        business: {
          include: {
            owner: {
              select: { email: true, name: true },
            },
          },
        },
      },
    });

    logger.info(`Found ${trialsEndingIn3Days.length} trial(s) ending in 3 days`);
    logger.info(`Found ${trialsEndingIn1Day.length} trial(s) ending in 1 day`);
    logger.info(`Found ${expiredTrials.length} expired trial(s)`);

    // Send 3-day warning notifications
    for (const location of trialsEndingIn3Days) {
      try {
        await notificationService.sendTrialEndingNotification(location.id, 3);
      } catch (error) {
        logger.error(`Failed to send 3-day trial warning for location ${location.id}:`, error);
      }
    }

    // Send 1-day warning notifications
    for (const location of trialsEndingIn1Day) {
      try {
        await notificationService.sendTrialEndingNotification(location.id, 1);
      } catch (error) {
        logger.error(`Failed to send 1-day trial warning for location ${location.id}:`, error);
      }
    }

    // Handle expired trials
    for (const location of expiredTrials) {
      try {
        // Update location status
        await prisma.location.update({
          where: { id: location.id },
          data: {
            subscriptionStatus: 'EXPIRED',
          },
        });

        // TODO: Send expired trial notification
        logger.warn('Trial expired - location updated:', {
          locationId: location.id,
          locationName: location.name,
          email: location.business.owner.email,
          trialEndsAt: location.trialEndsAt,
        });
      } catch (error) {
        logger.error(`Failed to process expired trial for location ${location.id}:`, error);
      }
    }

    logger.info('Trial expiry check job completed');
  } catch (error) {
    logger.error('Trial expiry check job failed:', error);
  }
}

/**
 * Initialize the trial expiry check cron job
 * Runs daily at midnight (00:00)
 */
export function initializeTrialExpiryJob(): void {
  // Run daily at midnight (00:00:00)
  cron.schedule('0 0 * * *', async () => {
    await checkTrialExpirations();
  });

  logger.info('✅ Trial expiry check job scheduled (runs daily at midnight)');

  // Run immediately on startup (for testing/debugging)
  if (process.env.NODE_ENV === 'development') {
    logger.info('Running trial expiry check job immediately (development mode)');
    checkTrialExpirations().catch((error) => {
      logger.error('Initial trial expiry check failed:', error);
    });
  }
}

/**
 * Manually trigger trial expiry check (for testing/admin)
 */
export async function triggerTrialExpiryCheck(): Promise<void> {
  await checkTrialExpirations();
}

