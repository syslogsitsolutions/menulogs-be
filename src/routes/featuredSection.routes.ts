import { Router } from 'express';
import featuredSectionController from '../controllers/featuredSection.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadSingle } from '../middleware/upload.middleware';

const router = Router();

router.use(authenticate);

router.post('/locations/:locationId', uploadSingle, featuredSectionController.create.bind(featuredSectionController)); // Accept file upload
router.get('/locations/:locationId', featuredSectionController.listByLocation.bind(featuredSectionController));
router.put('/:id', uploadSingle, featuredSectionController.update.bind(featuredSectionController)); // Accept file upload
router.delete('/:id', featuredSectionController.delete.bind(featuredSectionController));
router.patch('/:id/toggle', featuredSectionController.toggleActive.bind(featuredSectionController));

export default router;

