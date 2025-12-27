import { Router } from 'express';
import locationController from '../controllers/location.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireEmailVerification } from '../middleware/emailVerification.middleware';
import { uploadFields } from '../middleware/upload.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /location - Allow creating location without email verification (onboarding)
router.post('/', uploadFields, locationController.create.bind(locationController));

// GET /check-slug/:slug - Allow checking slug availability during onboarding (no email verification required)
router.get('/check-slug/:slug', locationController.checkSlug.bind(locationController));

// All other routes require email verification
router.use(requireEmailVerification);

router.get('/', locationController.list.bind(locationController));
router.get('/:id', locationController.get.bind(locationController));
router.put('/:id', uploadFields, locationController.update.bind(locationController));
router.delete('/:id', locationController.delete.bind(locationController));

export default router;

