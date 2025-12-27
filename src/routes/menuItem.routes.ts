import { Router } from 'express';
import menuItemController from '../controllers/menuItem.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireEmailVerification } from '../middleware/emailVerification.middleware';
import { uploadFields } from '../middleware/upload.middleware';
import {
  requireActiveSubscription,
  checkPlanLimit,
  checkStorageLimit,
} from '../middleware/subscription.middleware';

const router = Router();

router.use(authenticate);
router.use(requireEmailVerification); // All menu item routes require email verification

// POST route: require subscription, check plan limit, check storage limit
router.post(
  '/locations/:locationId',
  requireActiveSubscription,
  checkPlanLimit('menuItems'),
  checkStorageLimit,
  uploadFields,
  menuItemController.create.bind(menuItemController)
);

// GET route: require subscription
router.get(
  '/locations/:locationId',
  requireActiveSubscription,
  menuItemController.listByLocation.bind(menuItemController)
);

// PUT route: require subscription, check storage limit (if updating images)
router.put(
  '/:id',
  uploadFields, // Parse FormData first so req.body.locationId is available
  requireActiveSubscription,
  checkStorageLimit,
  menuItemController.update.bind(menuItemController)
);

// DELETE route: require subscription
router.delete(
  '/:id',
  requireActiveSubscription,
  menuItemController.delete.bind(menuItemController)
);

// PATCH route: require subscription
router.patch(
  '/:id/availability',
  requireActiveSubscription,
  menuItemController.updateAvailability.bind(menuItemController)
);

export default router;

