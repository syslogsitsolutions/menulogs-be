import { Router } from 'express';
import analyticsController from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireEmailVerification } from '../middleware/emailVerification.middleware';
import { requireActiveSubscription } from '../middleware/subscription.middleware';

const router = Router();

// All analytics routes require authentication and email verification
router.use(authenticate);
router.use(requireEmailVerification);

/**
 * GET /api/v1/locations/:locationId/analytics
 * Get analytics for a location with optional date range
 */
router.get(
  '/locations/:locationId',
  requireActiveSubscription,
  analyticsController.getAnalytics.bind(analyticsController)
);

/**
 * GET /api/v1/locations/:locationId/reports/summary
 * Get summary report for a location (with period parameter)
 */
router.get(
  '/locations/:locationId/reports/summary',
  requireActiveSubscription,
  analyticsController.getSummary.bind(analyticsController)
);

export default router;

