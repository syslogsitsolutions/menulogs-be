import { Router } from 'express';
import tableController from '../controllers/table.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List tables for a location
router.get('/locations/:locationId/tables', tableController.listByLocation);

// Get single table
router.get('/tables/:id', tableController.getById);

// Create table
router.post('/locations/:locationId/tables', tableController.create);

// Bulk create tables
router.post('/locations/:locationId/tables/bulk', tableController.bulkCreate);

// Reorder tables
router.post('/locations/:locationId/tables/reorder', tableController.reorder);

// Update table
router.patch('/tables/:id', tableController.update);

// Update table status
router.patch('/tables/:id/status', tableController.updateStatus);

// Delete table
router.delete('/tables/:id', tableController.delete);

export default router;

