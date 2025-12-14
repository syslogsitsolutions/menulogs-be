import { Router } from 'express';
import categoryController from '../controllers/category.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadSingle } from '../middleware/upload.middleware';

const router = Router();

router.use(authenticate);

router.post('/locations/:locationId', uploadSingle, categoryController.create.bind(categoryController)); // Accept file upload
router.get('/locations/:locationId', categoryController.listByLocation.bind(categoryController));
router.put('/:id', uploadSingle, categoryController.update.bind(categoryController)); // Accept file upload
router.delete('/:id', categoryController.delete.bind(categoryController));
router.patch('/:id/visibility', categoryController.toggleVisibility.bind(categoryController));

export default router;

