import { Router } from 'express';
import bannerController from '../controllers/banner.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadSingle } from '../middleware/upload.middleware';
import {
  requireActiveSubscription,
  checkPlanLimit,
  checkStorageLimit,
} from '../middleware/subscription.middleware';
import { requireEmailVerification } from '../middleware/emailVerification.middleware';

const router = Router();

router.use(authenticate);
router.use(requireEmailVerification); // All banner routes require email verification

router.post(
  '/locations/:locationId',
  requireActiveSubscription,
  checkPlanLimit('banners'),
  checkStorageLimit,
  uploadSingle,
  bannerController.create.bind(bannerController)
);
router.get(
  '/locations/:locationId',
  requireActiveSubscription,
  bannerController.listByLocation.bind(bannerController)
);
router.put(
  '/:id',
  uploadSingle, // Parse FormData first so req.body.locationId is available
  requireActiveSubscription,
  checkStorageLimit,
  bannerController.update.bind(bannerController)
);
router.delete(
  '/:id',
  requireActiveSubscription,
  bannerController.delete.bind(bannerController)
);
router.patch(
  '/:id/toggle',
  requireActiveSubscription,
  bannerController.toggleActive.bind(bannerController)
);

export default router;

