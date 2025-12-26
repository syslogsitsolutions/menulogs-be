import { Router } from 'express';
import featuredSectionController from '../controllers/featuredSection.controller';
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
  checkPlanLimit('featuredSections'),
  checkStorageLimit,
  uploadSingle,
  featuredSectionController.create.bind(featuredSectionController)
);
router.get(
  '/locations/:locationId',
  requireActiveSubscription,
  featuredSectionController.listByLocation.bind(featuredSectionController)
);
router.put(
  '/:id',
  uploadSingle, // Parse FormData first so req.body.locationId is available
  requireActiveSubscription,
  checkStorageLimit,
  featuredSectionController.update.bind(featuredSectionController)
);
router.delete(
  '/:id',
  requireActiveSubscription,
  featuredSectionController.delete.bind(featuredSectionController)
);
router.patch(
  '/:id/toggle',
  requireActiveSubscription,
  featuredSectionController.toggleActive.bind(featuredSectionController)
);

export default router;

