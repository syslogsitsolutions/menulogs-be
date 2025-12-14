/**
 * Payment Method Controller
 * 
 * Handles CRUD operations for saved payment methods.
 * 
 * @module controllers/paymentMethod
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import paymentMethodService from '../services/paymentMethod.service';
import { logger } from '../utils/logger.util';

// ==================== VALIDATION SCHEMAS ====================

const addPaymentMethodSchema = z.object({
  razorpayTokenId: z.string().min(1, 'Token ID is required'),
  type: z.enum(['card', 'upi', 'netbanking', 'wallet'], {
    errorMap: () => ({ message: 'Invalid payment method type' }),
  }),
  last4: z.string().length(4).optional(),
  brand: z.string().optional(),
  expiryMonth: z.number().min(1).max(12).optional(),
  expiryYear: z.number().min(2024).optional(),
  isDefault: z.boolean().optional(),
});

export class PaymentMethodController {
  /**
   * GET /api/v1/payment-methods
   * Get all payment methods for the current user
   */
  async getPaymentMethods(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;

      const paymentMethods = await paymentMethodService.getPaymentMethods(userId);

      res.json({
        paymentMethods,
        count: paymentMethods.length,
      });
    } catch (error) {
      logger.error('Error fetching payment methods:', error);
      next(error);
    }
  }

  /**
   * GET /api/v1/payment-methods/:id
   * Get a specific payment method
   */
  async getPaymentMethod(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const paymentMethod = await paymentMethodService.getPaymentMethod(userId, id);

      res.json({ paymentMethod });
    } catch (error) {
      if (error instanceof Error && error.message === 'Payment method not found') {
        res.status(404).json({ error: 'Payment method not found' });
        return;
      }

      logger.error('Error fetching payment method:', error);
      next(error);
    }
  }

  /**
   * POST /api/v1/payment-methods
   * Add a new payment method
   */
  async addPaymentMethod(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = addPaymentMethodSchema.parse(req.body);

      const paymentMethod = await paymentMethodService.addPaymentMethod(userId, data);

      res.status(201).json({
        success: true,
        message: 'Payment method added successfully',
        paymentMethod: {
          id: paymentMethod.id,
          type: paymentMethod.type,
          last4: paymentMethod.last4,
          brand: paymentMethod.brand,
          isDefault: paymentMethod.isDefault,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
        return;
      }

      logger.error('Error adding payment method:', error);
      next(error);
    }
  }

  /**
   * PATCH /api/v1/payment-methods/:id/set-default
   * Set a payment method as default
   */
  async setDefault(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const paymentMethod = await paymentMethodService.setDefaultPaymentMethod(userId, id);

      res.json({
        success: true,
        message: 'Default payment method updated',
        paymentMethod: {
          id: paymentMethod.id,
          isDefault: paymentMethod.isDefault,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Payment method not found') {
        res.status(404).json({ error: 'Payment method not found' });
        return;
      }

      logger.error('Error setting default payment method:', error);
      next(error);
    }
  }

  /**
   * DELETE /api/v1/payment-methods/:id
   * Delete a payment method
   */
  async deletePaymentMethod(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      await paymentMethodService.deletePaymentMethod(userId, id);

      res.json({
        success: true,
        message: 'Payment method deleted successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Payment method not found') {
        res.status(404).json({ error: 'Payment method not found' });
        return;
      }

      logger.error('Error deleting payment method:', error);
      next(error);
    }
  }

  /**
   * POST /api/v1/payment-methods/create-customer
   * Create a Razorpay customer for saving payment methods
   */
  async createCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;

      const customer = await paymentMethodService.createCustomer(userId);

      res.status(201).json({
        success: true,
        message: 'Customer created successfully',
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
        },
      });
    } catch (error) {
      logger.error('Error creating customer:', error);
      next(error);
    }
  }
}

export default new PaymentMethodController();

