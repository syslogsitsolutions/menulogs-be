/**
 * Subscription Expiry Check Job
 * 
 * Checks for expired subscriptions and handles grace periods.
 * Runs daily at midnight to process expirations.
 * 
 * @module jobs/subscriptionExpiry
 */

import cron from 'node-cron';
import prisma from '../config/database';
import dunningService from '../services/dunning.service';
import notificationService from '../services/notification.service';
import { logger } from '../utils/logger.util';

/**
 * Check and process expired subscriptions
 */
async function checkExpiredSubscriptions(): Promise<void> {
  try {
    logger.info('Starting subscription expiry check job...');

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Find subscriptions that expired today or before
    const expiredSubscriptions = await prisma.subscription.findMany({
      where: {
        endDate: {
          lte: now,
        },
        status: {
          in: ['ACTIVE', 'TRIAL'],
        },
      },
      include: {
        location: {
          include: {
            business: {
              include: {
                owner: {
                  select: { email: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    logger.info(`Found ${expiredSubscriptions.length} expired subscription(s)`);

    for (const subscription of expiredSubscriptions) {
      try {
        // Set grace period (7 days)
        const gracePeriodEndsAt = new Date();
        gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 7);

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'EXPIRED',
            gracePeriodStatus: 'ACTIVE',
            gracePeriodEndsAt,
            dunningStatus: 'GRACE_PERIOD',
          },
        });

        // Keep location active during grace period
        await prisma.location.update({
          where: { id: subscription.locationId },
          data: {
            subscriptionStatus: 'EXPIRED',
          },
        });

        // Send expiry notification
        await notificationService.sendExpiredNotification(subscription.locationId);

        logger.info('Subscription expired, grace period started:', {
          subscriptionId: subscription.id,
          locationId: subscription.locationId,
          plan: subscription.plan,
          gracePeriodEndsAt,
        });
      } catch (error) {
        logger.error(`Failed to process expired subscription ${subscription.id}:`, error);
      }
    }

    // Process subscriptions with expired grace periods
    await dunningService.processGracePeriodSubscriptions();

    logger.info('Subscription expiry check job completed');
  } catch (error) {
    logger.error('Subscription expiry check job failed:', error);
  }
}

/**
 * Initialize the subscription expiry check cron job
 * Runs daily at midnight (00:00)
 */
export function initializeSubscriptionExpiryJob(): void {
  // Run daily at midnight (00:00:00)
  cron.schedule('0 0 * * *', async () => {
    await checkExpiredSubscriptions();
  });

  logger.info('✅ Subscription expiry check job scheduled (runs daily at midnight)');

  // Run immediately on startup (for testing/debugging)
  if (process.env.NODE_ENV === 'development') {
    logger.info('Running subscription expiry check job immediately (development mode)');
    checkExpiredSubscriptions().catch((error) => {
      logger.error('Initial subscription expiry check failed:', error);
    });
  }
}

/**
 * Manually trigger subscription expiry check (for testing/admin)
 */
export async function triggerSubscriptionExpiryCheck(): Promise<void> {
  await checkExpiredSubscriptions();
}

