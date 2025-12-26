import { Router } from 'express';
import staffController from '../controllers/staff.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// PIN login (no auth required, but optional for linking)
router.post('/staff/pin-login', staffController.pinLogin);

// All other routes require authentication
router.use(authenticate);

// List staff for a location
router.get('/locations/:locationId/staff', staffController.listByLocation);

// Get single staff member
router.get('/staff/:id', staffController.getById);

// Get staff shifts
router.get('/staff/:id/shifts', staffController.getShifts);

// Get staff stats
router.get('/staff/:id/stats', staffController.getStats);

// Get staff orders
router.get('/staff/:id/orders', staffController.getStaffOrders);

// Create staff member
router.post('/locations/:locationId/staff', staffController.create);

// Update staff member
router.patch('/staff/:id', staffController.update);

// Reset staff PIN
router.patch('/staff/:id/pin', staffController.resetPin);

// Clock in
router.post('/staff/:id/clock-in', staffController.clockIn);

// Clock out
router.post('/staff/:id/clock-out', staffController.clockOut);

// Delete staff member
router.delete('/staff/:id', staffController.delete);

export default router;

