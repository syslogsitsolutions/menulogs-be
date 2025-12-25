import { Router } from 'express';
import orderController from '../controllers/order.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List orders for a location
router.get('/locations/:locationId/orders', orderController.listByLocation);

// Get kitchen orders (for KDS)
router.get('/locations/:locationId/kitchen-orders', orderController.getKitchenOrders);

// Get single order
router.get('/orders/:id', orderController.getById);

// Get order timeline
router.get('/orders/:id/timeline', orderController.getTimeline);

// Create order
router.post('/locations/:locationId/orders', orderController.create);

// Update order status
router.patch('/orders/:id/status', orderController.updateStatus);

// Add item to order
router.post('/orders/:id/items', orderController.addItem);

// Remove item from order
router.delete('/order-items/:id', orderController.removeItem);

// Update order item status
router.patch('/order-items/:id/status', orderController.updateItemStatus);

// Add payment to order
router.post('/orders/:id/payments', orderController.addPayment);

// Cancel order
router.post('/orders/:id/cancel', orderController.cancel);

export default router;

