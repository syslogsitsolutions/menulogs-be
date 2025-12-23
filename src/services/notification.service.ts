/**
 * Notification Service
 * 
 * Handles all subscription-related notifications (trial expiry, payment failures, etc.)
 * Uses the email service to send notifications to users.
 * 
 * @module services/notification
 */

import prisma from '../config/database';
import emailService from './email.service';
import { logger } from '../utils/logger.util';

export class NotificationService {
  /**
   * Send trial ending notification
   */
  async sendTrialEndingNotification(locationId: string, daysLeft: number): Promise<void> {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
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

    if (!location) {
      logger.warn('Location not found for trial ending notification:', { locationId });
      return;
    }

    try {
      await emailService.sendEmail({
        to: location.business.owner.email,
        subject: `Your MenuLogs trial ends in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
        html: `
          <h2>Your trial is ending soon!</h2>
          <p>Hi ${location.business.owner.name},</p>
          <p>Your free trial for <strong>${location.name}</strong> will end in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.</p>
          <p>To continue using MenuLogs, please upgrade to a paid plan:</p>
          <p><a href="${process.env.FRONTEND_URL}/subscription/upgrade?locationId=${locationId}">Upgrade Now</a></p>
          <p>Trial ends: ${location.trialEndsAt?.toLocaleDateString()}</p>
        `,
      });

      logger.info('Trial ending notification sent:', {
        locationId,
        daysLeft,
        email: location.business.owner.email,
      });
    } catch (error) {
      logger.error('Failed to send trial ending notification:', error);
    }
  }

  /**
   * Send expiry warning notification
   */
  async sendExpiryWarningNotification(locationId: string, daysLeft: number): Promise<void> {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: {
        subscription: true,
        business: {
          include: {
            owner: {
              select: { email: true, name: true },
            },
          },
        },
      },
    });

    if (!location || !location.subscription) {
      return;
    }

    try {
      await emailService.sendEmail({
        to: location.business.owner.email,
        subject: `Your MenuLogs subscription expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
        html: `
          <h2>Subscription expiring soon!</h2>
          <p>Hi ${location.business.owner.name},</p>
          <p>Your ${location.subscription.plan} subscription for <strong>${location.name}</strong> will expire in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.</p>
          <p>Please renew to avoid service interruption:</p>
          <p><a href="${process.env.FRONTEND_URL}/subscription/renew?locationId=${locationId}">Renew Subscription</a></p>
          <p>Expires: ${location.subscription.endDate?.toLocaleDateString()}</p>
        `,
      });

      logger.info('Expiry warning notification sent:', {
        locationId,
        daysLeft,
        email: location.business.owner.email,
      });
    } catch (error) {
      logger.error('Failed to send expiry warning notification:', error);
    }
  }

  /**
   * Send expired notification
   */
  async sendExpiredNotification(locationId: string): Promise<void> {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: {
        subscription: true,
        business: {
          include: {
            owner: {
              select: { email: true, name: true },
            },
          },
        },
      },
    });

    if (!location) {
      return;
    }

    try {
      await emailService.sendEmail({
        to: location.business.owner.email,
        subject: 'Your MenuLogs subscription has expired',
        html: `
          <h2>Subscription Expired</h2>
          <p>Hi ${location.business.owner.name},</p>
          <p>Your subscription for <strong>${location.name}</strong> has expired.</p>
          <p>You're currently in a grace period. Please renew to continue using all features:</p>
          <p><a href="${process.env.FRONTEND_URL}/subscription/renew?locationId=${locationId}">Renew Now</a></p>
          <p>Grace period ends: ${location.subscription?.gracePeriodEndsAt?.toLocaleDateString()}</p>
        `,
      });

      logger.info('Expired notification sent:', {
        locationId,
        email: location.business.owner.email,
      });
    } catch (error) {
      logger.error('Failed to send expired notification:', error);
    }
  }

  /**
   * Send payment failed notification
   */
  async sendPaymentFailedNotification(locationId: string): Promise<void> {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: {
        subscription: true,
        business: {
          include: {
            owner: {
              select: { email: true, name: true },
            },
          },
        },
      },
    });

    if (!location || !location.subscription) {
      return;
    }

    try {
      await emailService.sendEmail({
        to: location.business.owner.email,
        subject: 'Payment failed for your MenuLogs subscription',
        html: `
          <h2>Payment Failed</h2>
          <p>Hi ${location.business.owner.name},</p>
          <p>We were unable to process the payment for your ${location.subscription.plan} subscription for <strong>${location.name}</strong>.</p>
          <p>Please update your payment method to avoid service interruption:</p>
          <p><a href="${process.env.FRONTEND_URL}/subscription/payment?locationId=${locationId}">Update Payment Method</a></p>
          <p>Grace period ends: ${location.subscription.gracePeriodEndsAt?.toLocaleDateString()}</p>
        `,
      });

      logger.info('Payment failed notification sent:', {
        locationId,
        email: location.business.owner.email,
      });
    } catch (error) {
      logger.error('Failed to send payment failed notification:', error);
    }
  }

  /**
   * Send payment retry notification
   */
  async sendPaymentRetryNotification(locationId: string, attempt: number): Promise<void> {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: {
        subscription: true,
        business: {
          include: {
            owner: {
              select: { email: true, name: true },
            },
          },
        },
      },
    });

    if (!location || !location.subscription) {
      return;
    }

    try {
      await emailService.sendEmail({
        to: location.business.owner.email,
        subject: `Payment retry attempt ${attempt} for your MenuLogs subscription`,
        html: `
          <h2>Payment Retry ${attempt}</h2>
          <p>Hi ${location.business.owner.name},</p>
          <p>We're attempting to retry payment ${attempt} for your ${location.subscription.plan} subscription for <strong>${location.name}</strong>.</p>
          <p>Please ensure your payment method is up to date:</p>
          <p><a href="${process.env.FRONTEND_URL}/subscription/payment?locationId=${locationId}">Update Payment Method</a></p>
          <p>Grace period ends: ${location.subscription.gracePeriodEndsAt?.toLocaleDateString()}</p>
        `,
      });

      logger.info('Payment retry notification sent:', {
        locationId,
        attempt,
        email: location.business.owner.email,
      });
    } catch (error) {
      logger.error('Failed to send payment retry notification:', error);
    }
  }

  /**
   * Send upgrade recommendation
   */
  async sendUpgradeRecommendation(locationId: string, reason: string): Promise<void> {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
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

    if (!location) {
      return;
    }

    try {
      await emailService.sendEmail({
        to: location.business.owner.email,
        subject: 'Upgrade your MenuLogs plan',
        html: `
          <h2>Upgrade Recommendation</h2>
          <p>Hi ${location.business.owner.name},</p>
          <p>We noticed that you might benefit from upgrading your plan for <strong>${location.name}</strong>.</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p>Upgrade now to unlock more features:</p>
          <p><a href="${process.env.FRONTEND_URL}/subscription/upgrade?locationId=${locationId}">View Plans</a></p>
        `,
      });

      logger.info('Upgrade recommendation sent:', {
        locationId,
        reason,
        email: location.business.owner.email,
      });
    } catch (error) {
      logger.error('Failed to send upgrade recommendation:', error);
    }
  }

  /**
   * Send limit warning notification
   */
  async sendLimitWarning(locationId: string, resource: string, percentage: number): Promise<void> {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
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

    if (!location) {
      return;
    }

    try {
      await emailService.sendEmail({
        to: location.business.owner.email,
        subject: `You've used ${percentage}% of your ${resource} limit`,
        html: `
          <h2>Usage Limit Warning</h2>
          <p>Hi ${location.business.owner.name},</p>
          <p>You've used ${percentage}% of your ${resource} limit for <strong>${location.name}</strong>.</p>
          <p>Consider upgrading to avoid hitting your limit:</p>
          <p><a href="${process.env.FRONTEND_URL}/subscription/upgrade?locationId=${locationId}">Upgrade Plan</a></p>
        `,
      });

      logger.info('Limit warning sent:', {
        locationId,
        resource,
        percentage,
        email: location.business.owner.email,
      });
    } catch (error) {
      logger.error('Failed to send limit warning:', error);
    }
  }
}

export default new NotificationService();

