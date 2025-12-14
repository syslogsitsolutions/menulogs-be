/**
 * Subscription Service
 * 
 * Manages subscription lifecycle including creation, upgrades, cancellations,
 * and integration with Razorpay for recurring payments.
 * 
 * @module services/subscription
 */

import prisma from '../config/database';
import razorpay from '../config/razorpay';
import { logger } from '../utils/logger.util';

// Currency configuration
const CURRENCY = process.env.RAZORPAY_CURRENCY || 'INR';

// Pricing plans with multi-currency support
export const PRICING_PLANS = {
  FREE: {
    id: 'FREE',
    name: 'Free Trial',
    description: 'Perfect for trying out MenuLogs',
    price: 0,
    priceYearly: 0,
    interval: 'MONTHLY',
    features: {
      locations: 1,
      menuItems: 20,
      banners: 0,
      analytics: 'basic',
      support: 'email',
      customDomain: false,
      apiAccess: false,
    },
    limits: {
      storage: '100MB',
      imageUploads: 20,
      videoUploads: 0,
    },
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    description: 'Best for small restaurants',
    price: CURRENCY === 'INR' ? 299 : 29,
    priceYearly: CURRENCY === 'INR' ? 3051 : 305, // 15% discount
    interval: 'MONTHLY',
    features: {
      locations: 3,
      menuItems: 100,
      banners: 5,
      analytics: 'standard',
      support: 'email + chat',
      customDomain: false,
      apiAccess: false,
    },
    limits: {
      storage: '1GB',
      imageUploads: 100,
      videoUploads: 5,
    },
  },
  PROFESSIONAL: {
    id: 'PROFESSIONAL',
    name: 'Professional',
    description: 'For growing restaurant chains',
    price: CURRENCY === 'INR' ? 799 : 79,
    priceYearly: CURRENCY === 'INR' ? 8149 : 815, // 15% discount
    interval: 'MONTHLY',
    features: {
      locations: 10,
      menuItems: 500,
      banners: 20,
      analytics: 'advanced',
      support: 'priority',
      customDomain: true,
      apiAccess: true,
    },
    limits: {
      storage: '10GB',
      imageUploads: 500,
      videoUploads: 50,
    },
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Unlimited everything for large chains',
    price: CURRENCY === 'INR' ? 1999 : 199,
    priceYearly: CURRENCY === 'INR' ? 20389 : 2039, // 15% discount
    interval: 'MONTHLY',
    features: {
      locations: -1, // unlimited
      menuItems: -1, // unlimited
      banners: -1, // unlimited
      analytics: 'premium',
      support: 'dedicated',
      customDomain: true,
      apiAccess: true,
      whiteLabel: true,
    },
    limits: {
      storage: 'Unlimited',
      imageUploads: -1,
      videoUploads: -1,
    },
  },
};

export class SubscriptionService {
  // Get pricing plans
  async getPlans() {
    return Object.values(PRICING_PLANS);
  }

  // Get subscription for a location
  async getSubscription(locationId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { locationId },
      include: {
        location: {
          select: {
            id: true,
            name: true,
            business: {
              select: { name: true },
            },
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return subscription;
  }

  // Create subscription for location
  async createSubscription(
    locationId: string,
    plan: keyof typeof PRICING_PLANS,
    billingCycle: 'MONTHLY' | 'YEARLY'
  ) {
    const planDetails = PRICING_PLANS[plan];
    if (!planDetails) {
      throw new Error('Invalid plan');
    }

    // Calculate price based on billing cycle
    const price = billingCycle === 'YEARLY' ? planDetails.price * 12 * 0.85 : planDetails.price;

    const startDate = new Date();
    const nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + (billingCycle === 'MONTHLY' ? 1 : 12));

    // Create subscription in database
    const subscription = await prisma.subscription.create({
      data: {
        locationId,
        plan,
        status: plan === 'FREE' ? 'ACTIVE' : 'TRIAL',
        billingCycle,
        price,
        currency: 'USD',
        startDate,
        nextBillingDate: plan === 'FREE' ? null : nextBillingDate,
      },
    });

    // Update location subscription status
    await prisma.location.update({
      where: { id: locationId },
      data: {
        subscriptionPlan: plan,
        subscriptionStatus: subscription.status,
      },
    });

    // If paid plan, create Razorpay subscription
    if (plan !== 'FREE') {
      try {
        const { subscription: rzpSubscription, plan: rzpPlan } = await this.createRazorpaySubscription(
          subscription.id,
          price,
          billingCycle,
          plan
        );

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            razorpaySubscriptionId: rzpSubscription.id,
            razorpayPlanId: rzpPlan.id,
          },
        });

        logger.info('Subscription created with Razorpay:', {
          subscriptionId: subscription.id,
          razorpaySubscriptionId: rzpSubscription.id,
        });
      } catch (error) {
        logger.error('Razorpay subscription creation failed:', error);
        // Continue without Razorpay - can be set up later
        // The payment will be handled via one-time orders
      }
    }

    return subscription;
  }

  /**
   * Create Razorpay subscription with plan
   * @private
   */
  private async createRazorpaySubscription(
    subscriptionId: string,
    amount: number,
    interval: 'MONTHLY' | 'YEARLY',
    planName: string
  ) {
    try {
    // Create Razorpay plan first
    const plan = await razorpay.plans.create({
      period: interval === 'MONTHLY' ? 'monthly' : 'yearly',
      interval: 1,
      item: {
          name: `MenuLogs ${planName} Plan`,
        amount: Math.round(amount * 100), // Convert to paise/cents
          currency: CURRENCY,
          description: `${planName} subscription - ${interval.toLowerCase()} billing`,
        },
        notes: {
          subscriptionId,
          plan: planName,
          interval,
      },
    });

      logger.info('Razorpay plan created:', {
        planId: plan.id,
        subscriptionId,
        amount,
        interval,
      });

    // Create subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: plan.id,
      total_count: 120, // 10 years worth of billing
      customer_notify: 1,
        quantity: 1,
        notes: {
          subscriptionId,
          plan: planName,
        },
      });

      logger.info('Razorpay subscription created:', {
        razorpaySubscriptionId: subscription.id,
        subscriptionId,
        planId: plan.id,
    });

      return {
        subscription,
        plan,
      };
    } catch (error) {
      logger.error('Failed to create Razorpay subscription:', {
        error,
        subscriptionId,
        amount,
        interval,
      });
      throw error;
    }
  }

  // Upgrade/Downgrade plan
  async changePlan(
    subscriptionId: string,
    newPlan: keyof typeof PRICING_PLANS,
    billingCycle?: 'MONTHLY' | 'YEARLY'
  ) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { location: true },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const planDetails = PRICING_PLANS[newPlan];
    const cycle = billingCycle || subscription.billingCycle;
    const price = cycle === 'YEARLY' ? planDetails.price * 12 * 0.85 : planDetails.price;

    // Update subscription
    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        plan: newPlan,
        price,
        billingCycle: cycle,
        status: newPlan === 'FREE' ? 'ACTIVE' : subscription.status,
      },
    });

    // Update location
    await prisma.location.update({
      where: { id: subscription.locationId },
      data: {
        subscriptionPlan: newPlan,
      },
    });

    return updated;
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Cancel in Razorpay if exists
    if (subscription.razorpaySubscriptionId) {
      try {
        await razorpay.subscriptions.cancel(subscription.razorpaySubscriptionId, true);
      } catch (error) {
        console.error('Razorpay cancellation failed:', error);
      }
    }

    // Update subscription
    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    // Downgrade location to FREE plan
    await prisma.location.update({
      where: { id: subscription.locationId },
      data: {
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'CANCELLED',
      },
    });

    return updated;
  }

  // Get billing history
  async getBillingHistory(locationId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { locationId },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return subscription?.invoices || [];
  }

  // Create invoice
  async createInvoice(
    subscriptionId: string,
    amount: number,
    description: string,
    dueDate: Date
  ) {
    const invoice = await prisma.invoice.create({
      data: {
        subscriptionId,
        amount,
        currency: 'USD',
        status: 'PENDING',
        dueDate,
        description,
      },
    });

    return invoice;
  }

  // Mark invoice as paid
  async markInvoicePaid(invoiceId: string, razorpayPaymentId: string) {
    const invoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        razorpayPaymentId,
      },
    });

    return invoice;
  }

  /**
   * Handle Razorpay webhook events
   * @param event - Webhook event type
   * @param payload - Webhook payload
   */
  async handleWebhook(event: string, payload: any) {
    logger.info('Processing webhook event:', { event, payloadId: payload?.subscription?.id || payload?.payment?.id });

    try {
    switch (event) {
      case 'subscription.activated':
        await this.handleSubscriptionActivated(payload);
        break;

      case 'subscription.charged':
        await this.handleSubscriptionCharged(payload);
        break;

      case 'subscription.cancelled':
        await this.handleSubscriptionCancelled(payload);
        break;

        case 'subscription.paused':
          await this.handleSubscriptionPaused(payload);
          break;

        case 'subscription.resumed':
          await this.handleSubscriptionResumed(payload);
          break;

        case 'subscription.completed':
          await this.handleSubscriptionCompleted(payload);
          break;

      case 'payment.failed':
        await this.handlePaymentFailed(payload);
        break;

        case 'payment.captured':
          await this.handlePaymentCaptured(payload);
          break;

        case 'invoice.paid':
          await this.handleInvoicePaid(payload);
          break;

      default:
          logger.warn('Unhandled webhook event:', { event, payload });
      }
    } catch (error) {
      logger.error('Webhook processing error:', {
        event,
        error,
        payload,
      });
      throw error;
    }
  }

  private async handleSubscriptionActivated(payload: any) {
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId: payload.subscription.id },
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'ACTIVE' },
      });

      await prisma.location.update({
        where: { id: subscription.locationId },
        data: { subscriptionStatus: 'ACTIVE' },
      });
    }
  }

  private async handleSubscriptionCharged(payload: any) {
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId: payload.subscription.id },
    });

    if (subscription) {
      // Create invoice
      await this.createInvoice(
        subscription.id,
        payload.payment.amount / 100,
        `Subscription charge for ${subscription.plan}`,
        new Date()
      );

      // Mark as paid if payment successful
      if (payload.payment.status === 'captured') {
        const invoice = await prisma.invoice.findFirst({
          where: {
            subscriptionId: subscription.id,
            status: 'PENDING',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (invoice) {
          await this.markInvoicePaid(invoice.id, payload.payment.id);
        }
      }
    }
  }

  private async handleSubscriptionCancelled(payload: any) {
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId: payload.subscription.id },
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      await prisma.location.update({
        where: { id: subscription.locationId },
        data: { subscriptionStatus: 'CANCELLED' },
      });
    }
  }

  private async handlePaymentFailed(payload: any) {
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId: payload.subscription?.id },
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'INACTIVE' },
      });

      await prisma.location.update({
        where: { id: subscription.locationId },
        data: { subscriptionStatus: 'INACTIVE' },
      });

      // Create failed invoice record
      if (payload.payment) {
        await prisma.invoice.create({
          data: {
            subscriptionId: subscription.id,
            amount: payload.payment.amount / 100,
            currency: payload.payment.currency || CURRENCY,
            status: 'FAILED',
            dueDate: new Date(),
            description: `Failed payment for ${subscription.plan}`,
            razorpayPaymentId: payload.payment.id,
          },
        });
      }

      logger.warn('Payment failed for subscription:', {
        subscriptionId: subscription.id,
        locationId: subscription.locationId,
        paymentId: payload.payment?.id,
      });
    }
  }

  /**
   * Handle subscription paused event
   * @private
   */
  private async handleSubscriptionPaused(payload: any) {
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId: payload.subscription.id },
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'INACTIVE' },
      });

      await prisma.location.update({
        where: { id: subscription.locationId },
        data: { subscriptionStatus: 'INACTIVE' },
      });

      logger.info('Subscription paused:', {
        subscriptionId: subscription.id,
        locationId: subscription.locationId,
      });
    }
  }

  /**
   * Handle subscription resumed event
   * @private
   */
  private async handleSubscriptionResumed(payload: any) {
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId: payload.subscription.id },
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'ACTIVE' },
      });

      await prisma.location.update({
        where: { id: subscription.locationId },
        data: { subscriptionStatus: 'ACTIVE' },
      });

      logger.info('Subscription resumed:', {
        subscriptionId: subscription.id,
        locationId: subscription.locationId,
      });
    }
  }

  /**
   * Handle subscription completed event
   * @private
   */
  private async handleSubscriptionCompleted(payload: any) {
    const subscription = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId: payload.subscription.id },
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'EXPIRED',
          endDate: new Date(),
        },
      });

      await prisma.location.update({
        where: { id: subscription.locationId },
        data: { subscriptionStatus: 'EXPIRED' },
      });

      logger.info('Subscription completed:', {
        subscriptionId: subscription.id,
        locationId: subscription.locationId,
      });
    }
  }

  /**
   * Handle payment captured event
   * @private
   */
  private async handlePaymentCaptured(payload: any) {
    // Find invoice by payment ID and mark as paid
    const invoice = await prisma.invoice.findFirst({
      where: { razorpayPaymentId: payload.payment.id },
    });

    if (invoice && invoice.status === 'PENDING') {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      logger.info('Payment captured and invoice updated:', {
        invoiceId: invoice.id,
        paymentId: payload.payment.id,
      });
    }
  }

  /**
   * Handle invoice paid event
   * @private
   */
  private async handleInvoicePaid(payload: any) {
    const invoice = await prisma.invoice.findFirst({
      where: { razorpayInvoiceId: payload.invoice.id },
    });

    if (invoice && invoice.status !== 'PAID') {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          razorpayPaymentId: payload.payment?.id,
        },
      });

      logger.info('Invoice marked as paid:', {
        invoiceId: invoice.id,
        razorpayInvoiceId: payload.invoice.id,
      });
    }
  }
}

export default new SubscriptionService();

