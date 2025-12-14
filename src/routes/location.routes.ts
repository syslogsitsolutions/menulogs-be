import { Router } from 'express';
import locationController from '../controllers/location.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadFields } from '../middleware/upload.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', locationController.list.bind(locationController));
router.post('/', uploadFields, locationController.create.bind(locationController));
router.get('/check-slug/:slug', locationController.checkSlug.bind(locationController));
router.get('/:id', locationController.get.bind(locationController));
router.put('/:id', uploadFields, locationController.update.bind(locationController));
router.delete('/:id', locationController.delete.bind(locationController));

export default router;

