/**
 * Payment Routes
 * 
 * Handles all payment-related endpoints including order creation,
 * payment verification, refunds, and payment history.
 * 
 * @module routes/payment
 */

import { Router } from 'express';
import paymentController from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public route - Get payment configuration
router.get('/config', paymentController.getConfig.bind(paymentController));

// Protected routes
router.use(authenticate);

// Order management
router.post('/create-order', paymentController.createOrder.bind(paymentController));
router.get('/orders/:orderId', paymentController.getOrder.bind(paymentController));

// Payment verification
router.post('/verify', paymentController.verifyPayment.bind(paymentController));

// Payment details
router.get('/:paymentId', paymentController.getPayment.bind(paymentController));

// Refunds
router.post('/:paymentId/refund', paymentController.refundPayment.bind(paymentController));

export default router;

