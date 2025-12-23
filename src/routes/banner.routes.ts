import { Router } from 'express';
import bannerController from '../controllers/banner.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadSingle } from '../middleware/upload.middleware';
import {
  requireActiveSubscription,
  checkPlanLimit,
  checkStorageLimit,
} from '../middleware/subscription.middleware';

const router = Router();

router.use(authenticate);

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
  requireActiveSubscription,
  checkStorageLimit,
  uploadSingle,
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

