import { Request, Response, NextFunction } from 'express';
import subscriptionService, { PRICING_PLANS } from '../services/subscription.service';
import prisma from '../config/database';
import { z } from 'zod';
import crypto from 'crypto';

const createSubscriptionSchema = z.object({
  locationId: z.string().uuid(),
  plan: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});

const changePlanSchema = z.object({
  plan: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
});

export class SubscriptionController {
  // GET /api/v1/subscriptions/plans
  async getPlans(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await subscriptionService.getPlans();
      res.json({ plans });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/subscriptions/:locationId
  async getSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          business: { ownerId: userId },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const subscription = await subscriptionService.getSubscription(locationId);

      // Return subscription or null (don't throw 404 for missing subscriptions)
      res.json({ subscription: subscription || null });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/subscriptions
  async createSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = createSubscriptionSchema.parse(req.body);

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: {
          id: data.locationId,
          business: { ownerId: userId },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Check if subscription already exists
      const existing = await prisma.subscription.findUnique({
        where: { locationId: data.locationId },
      });

      if (existing) {
        res.status(400).json({ error: 'Subscription already exists for this location' });
        return;
      }

      const subscription = await subscriptionService.createSubscription(
        data.locationId,
        data.plan,
        data.billingCycle
      );

      res.status(201).json({
        message: 'Subscription created successfully',
        subscription,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // PUT /api/v1/subscriptions/:id/change-plan
  async changePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const data = changePlanSchema.parse(req.body);

      // Verify ownership
      const subscription = await prisma.subscription.findFirst({
        where: {
          id,
          location: {
            business: { ownerId: userId },
          },
        },
      });

      if (!subscription) {
        res.status(404).json({ error: 'Subscription not found' });
        return;
      }

      const updated = await subscriptionService.changePlan(id, data.plan, data.billingCycle);

      res.json({
        message: 'Plan changed successfully',
        subscription: updated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // POST /api/v1/subscriptions/:id/cancel
  async cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      // Verify ownership
      const subscription = await prisma.subscription.findFirst({
        where: {
          id,
          location: {
            business: { ownerId: userId },
          },
        },
      });

      if (!subscription) {
        res.status(404).json({ error: 'Subscription not found' });
        return;
      }

      const cancelled = await subscriptionService.cancelSubscription(id);

      res.json({
        message: 'Subscription cancelled successfully',
        subscription: cancelled,
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/subscriptions/:locationId/billing-history
  async getBillingHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          business: { ownerId: userId },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const invoices = await subscriptionService.getBillingHistory(locationId);

      res.json({ invoices });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/subscriptions/webhook
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature = req.headers['x-razorpay-signature'] as string;

      if (!signature) {
        res.status(400).json({
          error: 'Missing signature',
          message: 'X-Razorpay-Signature header is required',
        });
        return;
      }

      if (webhookSecret) {
        // Verify Razorpay webhook signature using timing-safe comparison
        const body = JSON.stringify(req.body);

        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(body)
          .digest('hex');

        // Use timing-safe comparison to prevent timing attacks
        const isValid = crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSignature)
        );

        if (!isValid) {
          console.error('Webhook signature verification failed');
          res.status(400).json({
            error: 'Invalid signature',
            message: 'Webhook signature verification failed',
          });
          return;
        }
      } else {
        // Log warning if webhook secret is not configured (development only)
        console.warn('Webhook secret not configured. Accepting webhook without verification.');
      }

      const { event, payload } = req.body;

      // Process webhook asynchronously
      await subscriptionService.handleWebhook(event, payload);

      // Always respond quickly to Razorpay
      res.status(200).json({
        status: 'success',
        message: 'Webhook processed successfully',
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
      // Still return 200 to prevent Razorpay retries for application errors
      res.status(200).json({
        status: 'error',
        message: 'Webhook received but processing failed',
      });
    }
  }

  // GET /api/v1/subscriptions/:locationId/usage
  async getUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          business: { ownerId: userId },
        },
        include: {
          subscription: true,
          _count: {
            select: {
              menuItems: true,
              banners: true,
            },
          },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Get plan limits
      const plan = location.subscriptionPlan || 'FREE';
      const planDetails = PRICING_PLANS[plan];

      // Calculate usage
      const usage = {
        plan,
        limits: planDetails.features,
        current: {
          menuItems: location._count.menuItems,
          banners: location._count.banners,
        },
        percentages: {
          menuItems:
            planDetails.features.menuItems === -1
              ? 0
              : (location._count.menuItems / planDetails.features.menuItems) * 100,
          banners:
            planDetails.features.banners === -1
              ? 0
              : planDetails.features.banners === 0
              ? 100
              : (location._count.banners / planDetails.features.banners) * 100,
        },
      };

      res.json({ usage });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/subscriptions/:locationId/checkout
  async createCheckoutSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;
      const { plan, billingCycle } = createSubscriptionSchema
        .omit({ locationId: true })
        .parse(req.body);

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          business: { ownerId: userId },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      if (plan === 'FREE') {
        res.status(400).json({ error: 'Free plan does not require checkout' });
        return;
      }

      const planDetails = PRICING_PLANS[plan];
      const price = billingCycle === 'YEARLY' ? planDetails.price * 12 * 0.85 : planDetails.price;

      // Create checkout session (placeholder - integrate with actual payment gateway)
      const checkoutSession = {
        sessionId: crypto.randomBytes(16).toString('hex'),
        amount: price,
        currency: 'USD',
        plan,
        billingCycle,
        locationId,
        // In real implementation, this would be a Razorpay/Stripe checkout URL
        checkoutUrl: `${process.env.FRONTEND_URL}/checkout/${locationId}?plan=${plan}`,
      };

      res.json({
        message: 'Checkout session created',
        checkout: checkoutSession,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }
}

export default new SubscriptionController();

