/**
 * Dunning Service
 * 
 * Handles payment retry logic and dunning management for failed payments.
 * Implements industry-standard retry schedules and notifications.
 * 
 * @module services/dunning
 */

import prisma from '../config/database';
import { logger } from '../utils/logger.util';
import razorpay from '../config/razorpay';
import notificationService from './notification.service';

export class DunningService {
  /**
   * Process failed payment - initiate dunning process
   */
  async processFailedPayment(subscriptionId: string): Promise<void> {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
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

    if (!subscription) {
      logger.error('Subscription not found for dunning:', { subscriptionId });
      return;
    }

    const retryCount = subscription.paymentRetryCount || 0;

    // Set grace period based on retry count
    const gracePeriodEndsAt = new Date();
    let dunningStatus: string;

    if (retryCount === 0) {
      // First retry: 1 day grace period
      gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 1);
      dunningStatus = 'FIRST_RETRY';
    } else if (retryCount === 1) {
      // Second retry: 3 days grace period
      gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 3);
      dunningStatus = 'SECOND_RETRY';
    } else if (retryCount === 2) {
      // Third retry: 7 days grace period
      gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 7);
      dunningStatus = 'FINAL_NOTICE';
    } else {
      // After 3 retries, cancel subscription
      await this.cancelAfterRetries(subscriptionId);
      return;
    }

    // Update subscription with grace period
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        gracePeriodStatus: 'ACTIVE',
        gracePeriodEndsAt,
        lastPaymentAttempt: new Date(),
        paymentRetryCount: retryCount + 1,
        dunningStatus,
      },
    });

    // Send notification
    await this.sendRetryNotification(subscriptionId, retryCount + 1);
    await notificationService.sendPaymentRetryNotification(subscription.locationId, retryCount + 1);

    logger.info('Dunning process initiated:', {
      subscriptionId,
      retryCount: retryCount + 1,
      gracePeriodEndsAt,
      dunningStatus,
    });
  }

  /**
   * Retry payment for a subscription
   */
  async retryPayment(subscriptionId: string): Promise<boolean> {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
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

    if (!subscription || !subscription.razorpaySubscriptionId) {
      logger.error('Subscription or Razorpay subscription ID not found:', { subscriptionId });
      return false;
    }

    try {
      // Note: Razorpay automatically retries failed subscription payments
      // For manual retry, we would need to create a payment order
      // For now, we'll check if Razorpay has already processed the payment
      // by checking the subscription status via webhook
      
      // Fetch subscription from Razorpay to check status
      const razorpaySubscription = await razorpay.subscriptions.fetch(
        subscription.razorpaySubscriptionId
      );

      // If subscription is active in Razorpay, update our database
      if (razorpaySubscription.status === 'active') {
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'ACTIVE',
            gracePeriodStatus: null,
            gracePeriodEndsAt: null,
            paymentRetryCount: 0,
            dunningStatus: null,
            lastPaymentAttempt: new Date(),
          },
        });

        await prisma.location.update({
          where: { id: subscription.locationId },
          data: {
            subscriptionStatus: 'ACTIVE',
          },
        });

        logger.info('Payment retry successful (verified via Razorpay):', {
          subscriptionId,
          razorpaySubscriptionId: subscription.razorpaySubscriptionId,
        });

        return true;
      }

      // If still pending/failed, return false
      logger.warn('Payment retry still pending in Razorpay:', {
        subscriptionId,
        razorpayStatus: razorpaySubscription.status,
      });

      return false;
    } catch (error) {
      logger.error('Payment retry check failed:', {
        subscriptionId,
        error,
      });
      return false;
    }
  }

  /**
   * Send retry notification
   * Note: Actual email sending is handled by notificationService
   */
  async sendRetryNotification(subscriptionId: string, attempt: number): Promise<void> {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
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

    if (!subscription) {
      return;
    }

    logger.info('Payment retry notification triggered:', {
      subscriptionId,
      attempt,
      email: subscription.location.business.owner.email,
      gracePeriodEndsAt: subscription.gracePeriodEndsAt,
    });
  }

  /**
   * Handle final notice before cancellation
   */
  async handleFinalNotice(subscriptionId: string): Promise<void> {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
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

    if (!subscription) {
      return;
    }

    // Send final notice notification
    await notificationService.sendPaymentRetryNotification(
      subscription.locationId,
      subscription.paymentRetryCount || 3
    );

    logger.warn('Final notice sent for subscription:', {
      subscriptionId,
      locationId: subscription.locationId,
      email: subscription.location.business.owner.email,
    });
  }

  /**
   * Cancel subscription after all retries exhausted
   */
  async cancelAfterRetries(subscriptionId: string): Promise<void> {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      return;
    }

    // Cancel in Razorpay if exists
    if (subscription.razorpaySubscriptionId) {
      try {
        await razorpay.subscriptions.cancel(subscription.razorpaySubscriptionId, true);
      } catch (error) {
        logger.error('Failed to cancel Razorpay subscription:', error);
      }
    }

    // Update subscription
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        gracePeriodStatus: 'EXPIRED',
        dunningStatus: 'CANCELLED',
      },
    });

    // Update location
    await prisma.location.update({
      where: { id: subscription.locationId },
      data: {
        subscriptionStatus: 'CANCELLED',
        subscriptionPlan: 'FREE',
      },
    });

    logger.warn('Subscription cancelled after retries exhausted:', {
      subscriptionId,
      locationId: subscription.locationId,
      retryCount: subscription.paymentRetryCount,
    });
  }

  /**
   * Process all subscriptions in grace period
   * Called by scheduled job
   */
  async processGracePeriodSubscriptions(): Promise<void> {
    const now = new Date();
    
    // Find subscriptions in grace period
    const subscriptions = await prisma.subscription.findMany({
      where: {
        gracePeriodStatus: 'ACTIVE',
        gracePeriodEndsAt: {
          lte: now, // Grace period expired
        },
        status: {
          not: 'CANCELLED',
        },
      },
      include: {
        location: true,
      },
    });

    logger.info(`Processing ${subscriptions.length} subscriptions with expired grace period`);

    for (const subscription of subscriptions) {
      const retryCount = subscription.paymentRetryCount || 0;

      if (retryCount < 3) {
        // Try to retry payment
        const success = await this.retryPayment(subscription.id);
        
        if (!success) {
          // Retry failed, move to next retry stage
          await this.processFailedPayment(subscription.id);
        }
      } else {
        // All retries exhausted, cancel subscription
        await this.cancelAfterRetries(subscription.id);
      }
    }
  }
}

export default new DunningService();

