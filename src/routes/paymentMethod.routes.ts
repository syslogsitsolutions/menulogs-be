/**
 * Payment Method Routes
 * 
 * Endpoints for managing saved payment methods.
 * 
 * @module routes/paymentMethod
 */

import { Router } from 'express';
import paymentMethodController from '../controllers/paymentMethod.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Payment method CRUD
router.get('/', paymentMethodController.getPaymentMethods.bind(paymentMethodController));
router.get('/:id', paymentMethodController.getPaymentMethod.bind(paymentMethodController));
router.post('/', paymentMethodController.addPaymentMethod.bind(paymentMethodController));
router.patch('/:id/set-default', paymentMethodController.setDefault.bind(paymentMethodController));
router.delete('/:id', paymentMethodController.deletePaymentMethod.bind(paymentMethodController));

// Customer management
router.post('/create-customer', paymentMethodController.createCustomer.bind(paymentMethodController));

export default router;

