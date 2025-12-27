import { Router } from 'express';
import businessController from '../controllers/business.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireEmailVerification } from '../middleware/emailVerification.middleware';
import { uploadFields } from '../middleware/upload.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /business - Allow creating business without email verification (onboarding)
router.post('/', uploadFields, businessController.create.bind(businessController));

// All other routes require email verification
router.use(requireEmailVerification);

router.get('/', businessController.list.bind(businessController));
router.get('/:id', businessController.get.bind(businessController));
router.put('/:id', uploadFields, businessController.update.bind(businessController)); // Accept file uploads
router.delete('/:id', businessController.delete.bind(businessController));

export default router;

