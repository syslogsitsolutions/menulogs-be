import { Router } from 'express';
import categoryController from '../controllers/category.controller';
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
  checkPlanLimit('categories'),
  checkStorageLimit,
  uploadSingle,
  categoryController.create.bind(categoryController)
);
router.get(
  '/locations/:locationId',
  requireActiveSubscription,
  categoryController.listByLocation.bind(categoryController)
);
router.put(
  '/:id',
  requireActiveSubscription,
  checkStorageLimit,
  uploadSingle,
  categoryController.update.bind(categoryController)
);
router.delete(
  '/:id',
  requireActiveSubscription,
  categoryController.delete.bind(categoryController)
);
router.patch(
  '/:id/visibility',
  requireActiveSubscription,
  categoryController.toggleVisibility.bind(categoryController)
);

export default router;

