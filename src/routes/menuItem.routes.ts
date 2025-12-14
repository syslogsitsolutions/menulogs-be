import { Router } from 'express';
import menuItemController from '../controllers/menuItem.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadFields } from '../middleware/upload.middleware';

const router = Router();

router.use(authenticate);

router.post('/locations/:locationId', uploadFields, menuItemController.create.bind(menuItemController)); // Accept file uploads
router.get('/locations/:locationId', menuItemController.listByLocation.bind(menuItemController));
router.put('/:id', uploadFields, menuItemController.update.bind(menuItemController)); // Accept file uploads
router.delete('/:id', menuItemController.delete.bind(menuItemController));
router.patch('/:id/availability', menuItemController.updateAvailability.bind(menuItemController));

export default router;

