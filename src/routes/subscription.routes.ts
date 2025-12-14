import { Router } from 'express';
import subscriptionController from '../controllers/subscription.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public route - get pricing plans
router.get('/plans', subscriptionController.getPlans.bind(subscriptionController));

// Webhook - no auth (verified by signature)
router.post('/webhook', subscriptionController.handleWebhook.bind(subscriptionController));

// Protected routes
router.use(authenticate);

// Subscription management
router.get('/:locationId', subscriptionController.getSubscription.bind(subscriptionController));
router.post('/', subscriptionController.createSubscription.bind(subscriptionController));
router.put('/:id/change-plan', subscriptionController.changePlan.bind(subscriptionController));
router.post('/:id/cancel', subscriptionController.cancelSubscription.bind(subscriptionController));

// Billing
router.get(
  '/:locationId/billing-history',
  subscriptionController.getBillingHistory.bind(subscriptionController)
);

// Usage tracking
router.get('/:locationId/usage', subscriptionController.getUsage.bind(subscriptionController));

// Checkout
router.post(
  '/:locationId/checkout',
  subscriptionController.createCheckoutSession.bind(subscriptionController)
);

export default router;

