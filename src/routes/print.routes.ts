import { Router } from 'express';
import printController from '../controllers/print.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get KOT data for an order
router.get('/orders/:id/kot', printController.getKOT);

// Get Bill/Invoice data for an order
router.get('/orders/:id/bill', printController.getBill);

export default router;

