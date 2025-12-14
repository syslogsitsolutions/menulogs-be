import { Router } from 'express';
import bannerController from '../controllers/banner.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadSingle } from '../middleware/upload.middleware';

const router = Router();

router.use(authenticate);

router.post('/locations/:locationId', uploadSingle, bannerController.create.bind(bannerController)); // Accept file upload
router.get('/locations/:locationId', bannerController.listByLocation.bind(bannerController));
router.put('/:id', uploadSingle, bannerController.update.bind(bannerController)); // Accept file upload
router.delete('/:id', bannerController.delete.bind(bannerController));
router.patch('/:id/toggle', bannerController.toggleActive.bind(bannerController));

export default router;

