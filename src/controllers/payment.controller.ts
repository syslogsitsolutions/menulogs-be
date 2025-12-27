/**
 * Payment Controller
 * 
 * Handles Razorpay payment order creation, verification, and processing.
 * Implements industry-standard security practices for payment handling.
 * 
 * @module controllers/payment
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import razorpay, { verifyPaymentSignature, getRazorpayKeyId } from '../config/razorpay';
import prisma from '../config/database';
import { logger } from '../utils/logger.util';
import subscriptionService from '../services/subscription.service';

// ==================== VALIDATION SCHEMAS ====================

const createOrderSchema = z.object({
  locationId: z.string().uuid('Invalid location ID'),
  plan: z.enum(['STANDARD', 'PROFESSIONAL', 'CUSTOM'], {
    errorMap: () => ({ message: 'Invalid subscription plan' }),
  }),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, 'Order ID is required'),
  razorpay_payment_id: z.string().min(1, 'Payment ID is required'),
  razorpay_signature: z.string().min(1, 'Signature is required'),
  locationId: z.string().uuid('Invalid location ID'),
  plan: z.enum(['STANDARD', 'PROFESSIONAL', 'CUSTOM']),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']),
});

const refundPaymentSchema = z.object({
  paymentId: z.string().min(1, 'Payment ID is required'),
  amount: z.number().positive().optional(),
  reason: z.string().optional(),
});

// ==================== PRICING CONFIGURATION ====================
// Prices in paise (smallest currency unit)
// Note: CUSTOM plan pricing is handled separately (contact sales)

const PRICING_PLANS = {
  STANDARD: {
    monthly: 59900, // in paise (599.00 or $5.99)
    yearly: 599000, // in paise (5990.00 or $59.90) - 17% discount
  },
  PROFESSIONAL: {
    monthly: 99900, // in paise (999.00 or $9.99)
    yearly: 999000, // in paise (9990.00 or $99.90) - 17% discount
  },
  CUSTOM: {
    monthly: 499900, // in paise (₹4,999.00 or $50.00) - starting price
    yearly: 4999000, // in paise (₹49,990.00 or $500.00) - starting price with discount
    // Note: CUSTOM plan pricing is typically negotiated per customer
  },
};

export class PaymentController {
  /**
   * GET /api/v1/payments/config
   * Get Razorpay public configuration for frontend
   */
  async getConfig(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const keyId = getRazorpayKeyId();

      if (!keyId) {
        res.status(503).json({
          error: 'Payment service is not configured',
          message: 'Please contact support',
        });
        return;
      }

      res.json({
        keyId,
        currency: process.env.RAZORPAY_CURRENCY || 'INR',
      });
    } catch (error) {
      logger.error('Error fetching payment config:', error);
      next(error);
    }
  }

  /**
   * POST /api/v1/payments/create-order
   * Create a Razorpay order for subscription payment
   */
  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = createOrderSchema.parse(req.body);

      // Verify location ownership
      const location = await prisma.location.findFirst({
        where: {
          id: data.locationId,
          business: { ownerId: userId },
        },
        include: {
          business: {
            include: {
              owner: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          subscription: true,
        },
      });

      if (!location) {
        res.status(404).json({
          error: 'Location not found',
          message: 'You do not have access to this location',
        });
        return;
      }

      // Check if already has active subscription
      if (
        location.subscription &&
        (location.subscription.status === 'ACTIVE' || location.subscription.status === 'TRIAL')
      ) {
        res.status(400).json({
          error: 'Active subscription exists',
          message: 'Please cancel or upgrade your existing subscription',
        });
        return;
      }

      // Handle CUSTOM plan - redirect to contact sales
      if (data.plan === 'CUSTOM') {
        res.status(400).json({
          error: 'Custom plan requires sales contact',
          message: 'Please contact our sales team for custom pricing',
          contactUrl: `${process.env.FRONTEND_URL}/contact?plan=CUSTOM&locationId=${data.locationId}`,
          salesEmail: process.env.SALES_EMAIL || 'sales@menulogs.com',
        });
        return;
      }

      // Calculate amount based on plan and billing cycle
      const planPricing = PRICING_PLANS[data.plan];
      if (!planPricing) {
        res.status(400).json({
          error: 'Invalid plan',
          message: `Plan ${data.plan} is not available`,
        });
        return;
      }

      const amount = data.billingCycle === 'YEARLY' ? planPricing.yearly : planPricing.monthly;
      const currency = process.env.RAZORPAY_CURRENCY || 'INR';

      // Generate short receipt ID (max 40 chars for Razorpay)
      // Format: ML + first 8 chars of locationId + timestamp (last 8 digits)
      const locationIdShort = data.locationId.replace(/-/g, '').substring(0, 8);
      const timestampShort = Date.now().toString().slice(-8);
      const receipt = `ML${locationIdShort}${timestampShort}`.substring(0, 40);

      // Create Razorpay order
      const order = await razorpay.orders.create({
        amount,
        currency,
        receipt,
        notes: {
          locationId: data.locationId,
          businessId: location.businessId,
          userId: userId,
          plan: data.plan,
          billingCycle: data.billingCycle,
          userEmail: location.business.owner.email,
          locationName: location.name,
        },
      });

      logger.info('Payment order created:', {
        orderId: order.id,
        locationId: data.locationId,
        plan: data.plan,
        amount,
        userId,
      });

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
        },
        config: {
          keyId: getRazorpayKeyId(),
          name: 'MenuLogs',
          description: `${data.plan} Plan - ${data.billingCycle}`,
          prefill: {
            name: location.business.owner.name,
            email: location.business.owner.email,
          },
          theme: {
            color: '#3B82F6',
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
        return;
      }

      logger.error('Error creating payment order:', error);
      next(error);
    }
  }

  /**
   * POST /api/v1/payments/verify
   * Verify payment signature and activate subscription
   */
  async verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = verifyPaymentSchema.parse(req.body);

      // Verify location ownership
      const location = await prisma.location.findFirst({
        where: {
          id: data.locationId,
          business: { ownerId: userId },
        },
        include: {
          subscription: true,
        },
      });

      if (!location) {
        res.status(404).json({
          error: 'Location not found',
        });
        return;
      }

      // Verify payment signature
      const isValid = verifyPaymentSignature(
        data.razorpay_order_id,
        data.razorpay_payment_id,
        data.razorpay_signature
      );

      if (!isValid) {
        logger.error('Payment signature verification failed:', {
          orderId: data.razorpay_order_id,
          paymentId: data.razorpay_payment_id,
          locationId: data.locationId,
          userId,
        });

        res.status(400).json({
          error: 'Payment verification failed',
          message: 'Invalid payment signature',
        });
        return;
      }

      // Fetch payment details from Razorpay
      const payment = await razorpay.payments.fetch(data.razorpay_payment_id);

      if (payment.status !== 'captured' && payment.status !== 'authorized') {
        res.status(400).json({
          error: 'Payment not successful',
          message: `Payment status: ${payment.status}`,
        });
        return;
      }

      // Calculate subscription dates
      const startDate = new Date();
      const endDate = new Date();
      const nextBillingDate = new Date();

      if (data.billingCycle === 'YEARLY') {
        endDate.setFullYear(endDate.getFullYear() + 1);
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      }

      // Get feature flags for the plan
      const featureFlags = subscriptionService.getFeatureFlagsForPlan(data.plan);

      // Create or update subscription
      const paymentAmount = typeof payment.amount === 'number' ? payment.amount : Number(payment.amount);
      const subscription = await prisma.subscription.upsert({
        where: { locationId: data.locationId },
        create: {
          locationId: data.locationId,
          plan: data.plan as any, // Type assertion needed until Prisma client is regenerated
          status: 'ACTIVE',
          billingCycle: data.billingCycle,
          price: paymentAmount / 100, // Convert paise to rupees
          currency: payment.currency.toUpperCase(),
          startDate,
          endDate,
          nextBillingDate,
          // Feature flags
          teamMemberLimit: featureFlags.teamMemberLimit,
          customDomainEnabled: featureFlags.customDomainEnabled,
          apiAccessEnabled: featureFlags.apiAccessEnabled,
          whiteLabelEnabled: featureFlags.whiteLabelEnabled,
          // ssoEnabled: featureFlags.ssoEnabled,
        },
        update: {
          plan: data.plan as any, // Type assertion needed until Prisma client is regenerated
          status: 'ACTIVE',
          billingCycle: data.billingCycle,
          price: paymentAmount / 100,
          currency: payment.currency.toUpperCase(),
          startDate,
          endDate,
          nextBillingDate,
          // Update feature flags
          teamMemberLimit: featureFlags.teamMemberLimit,
          customDomainEnabled: featureFlags.customDomainEnabled,
          apiAccessEnabled: featureFlags.apiAccessEnabled,
          whiteLabelEnabled: featureFlags.whiteLabelEnabled,
          // ssoEnabled: featureFlags.ssoEnabled,
        },
      });

      // Update location status and initialize usage tracking
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(0, 0, 0, 0);

      await prisma.location.update({
        where: { id: data.locationId },
        data: {
          subscriptionPlan: data.plan as any, // Type assertion needed until Prisma client is regenerated
          subscriptionStatus: 'ACTIVE',
          trialEndsAt: null,
          // Initialize monthly upload reset date if not set
          monthlyUploadResetDate: {
            set: nextMonth,
          },
        },
      });

      // Create invoice record
      await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          amount: paymentAmount / 100,
          currency: payment.currency.toUpperCase(),
          status: 'PAID',
          paidAt: new Date(),
          dueDate: startDate,
          description: `${data.plan} Plan - ${data.billingCycle} subscription`,
          razorpayPaymentId: data.razorpay_payment_id,
        },
      });

      logger.info('Payment verified and subscription activated:', {
        subscriptionId: subscription.id,
        locationId: data.locationId,
        paymentId: data.razorpay_payment_id,
        plan: data.plan,
        userId,
      });

      res.json({
        success: true,
        message: 'Payment verified successfully',
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          nextBillingDate: subscription.nextBillingDate,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
        return;
      }

      logger.error('Error verifying payment:', error);
      next(error);
    }
  }

  /**
   * GET /api/v1/payments/:paymentId
   * Fetch payment details
   */
  async getPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { paymentId } = req.params;
      const userId = req.user!.userId;

      // Fetch payment from Razorpay
      const payment = await razorpay.payments.fetch(paymentId);

      // Verify the payment belongs to the user
      const locationId = payment.notes?.locationId;
      if (locationId) {
        const locationIdStr = typeof locationId === 'string' ? locationId : String(locationId);
        const location = await prisma.location.findFirst({
          where: {
            id: locationIdStr,
            business: { ownerId: userId },
          },
        });

        if (!location) {
          res.status(403).json({
            error: 'Access denied',
            message: 'You do not have access to this payment',
          });
          return;
        }
      }

      const paymentAmount = typeof payment.amount === 'number' ? payment.amount : Number(payment.amount);
      res.json({
        payment: {
          id: payment.id,
          amount: paymentAmount / 100,
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          createdAt: new Date(payment.created_at * 1000),
          email: payment.email,
          contact: payment.contact,
        },
      });
    } catch (error) {
      logger.error('Error fetching payment:', error);
      next(error);
    }
  }

  /**
   * POST /api/v1/payments/:paymentId/refund
   * Refund a payment (admin or special cases)
   */
  async refundPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { paymentId } = req.params;
      const userId = req.user!.userId;
      const data = refundPaymentSchema.parse(req.body);

      // Fetch payment details
      const payment = await razorpay.payments.fetch(paymentId);

      // Verify ownership
      const locationId = payment.notes?.locationId;
      if (locationId) {
        const locationIdStr = typeof locationId === 'string' ? locationId : String(locationId);
        const location = await prisma.location.findFirst({
          where: {
            id: locationIdStr,
            business: { ownerId: userId },
          },
        });

        if (!location) {
          res.status(403).json({
            error: 'Access denied',
          });
          return;
        }
      }

      // Create refund
      const refund = await razorpay.payments.refund(paymentId, {
        amount: data.amount ? data.amount * 100 : payment.amount, // Convert to paise
        notes: {
          reason: data.reason || 'Requested by user',
          userId,
        },
      });

      const refundAmount = refund.amount 
        ? (typeof refund.amount === 'number' ? refund.amount : Number(refund.amount)) / 100
        : 0;

      logger.info('Payment refunded:', {
        paymentId,
        refundId: refund.id,
        amount: refundAmount,
        userId,
      });

      res.json({
        success: true,
        message: 'Refund initiated successfully',
        refund: {
          id: refund.id,
          amount: refundAmount,
          currency: refund.currency,
          status: refund.status,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
        return;
      }

      logger.error('Error processing refund:', error);
      next(error);
    }
  }

  /**
   * GET /api/v1/payments/orders/:orderId
   * Fetch order details
   */
  async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = req.params;
      const userId = req.user!.userId;

      // Fetch order from Razorpay
      const order = await razorpay.orders.fetch(orderId);

      // Verify ownership
      const locationId = order.notes?.locationId;
      if (locationId) {
        const locationIdStr = typeof locationId === 'string' ? locationId : String(locationId);
        const location = await prisma.location.findFirst({
          where: {
            id: locationIdStr,
            business: { ownerId: userId },
          },
        });

        if (!location) {
          res.status(403).json({
            error: 'Access denied',
          });
          return;
        }
      }

      const orderAmount = typeof order.amount === 'number' ? order.amount : Number(order.amount);
      res.json({
        order: {
          id: order.id,
          amount: orderAmount / 100,
          currency: order.currency,
          status: order.status,
          receipt: order.receipt,
          createdAt: new Date(order.created_at * 1000),
          notes: order.notes,
        },
      });
    } catch (error) {
      logger.error('Error fetching order:', error);
      next(error);
    }
  }
}

export default new PaymentController();

