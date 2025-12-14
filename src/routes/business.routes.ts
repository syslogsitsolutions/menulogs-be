import { Router } from 'express';
import businessController from '../controllers/business.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadFields } from '../middleware/upload.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', businessController.list.bind(businessController));
router.post('/', uploadFields, businessController.create.bind(businessController)); // Accept file uploads
router.get('/:id', businessController.get.bind(businessController));
router.put('/:id', uploadFields, businessController.update.bind(businessController)); // Accept file uploads
router.delete('/:id', businessController.delete.bind(businessController));

export default router;

