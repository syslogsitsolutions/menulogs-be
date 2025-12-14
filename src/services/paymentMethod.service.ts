/**
 * Payment Method Service
 * 
 * Manages saved payment methods (cards, UPI, etc.) for users.
 * Integrates with Razorpay for tokenization and secure storage.
 * 
 * @module services/paymentMethod
 */

import prisma from '../config/database';
import razorpay from '../config/razorpay';
import { logger } from '../utils/logger.util';

export class PaymentMethodService {
  /**
   * Get all payment methods for a user
   */
  async getPaymentMethods(userId: string) {
    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return paymentMethods.map((pm) => ({
      id: pm.id,
      type: pm.type,
      last4: pm.last4,
      brand: pm.brand,
      expiryMonth: pm.expiryMonth,
      expiryYear: pm.expiryYear,
      isDefault: pm.isDefault,
      createdAt: pm.createdAt,
    }));
  }

  /**
   * Add a new payment method
   */
  async addPaymentMethod(
    userId: string,
    data: {
      razorpayTokenId: string;
      type: string;
      last4?: string;
      brand?: string;
      expiryMonth?: number;
      expiryYear?: number;
      isDefault?: boolean;
    }
  ) {
    // If this is being set as default, unset other defaults
    if (data.isDefault) {
      await prisma.paymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // If this is the first payment method, make it default
    const existingCount = await prisma.paymentMethod.count({
      where: { userId },
    });

    const isDefault = data.isDefault !== undefined ? data.isDefault : existingCount === 0;

    const paymentMethod = await prisma.paymentMethod.create({
      data: {
        userId,
        razorpayTokenId: data.razorpayTokenId,
        type: data.type,
        last4: data.last4,
        brand: data.brand,
        expiryMonth: data.expiryMonth,
        expiryYear: data.expiryYear,
        isDefault,
      },
    });

    logger.info('Payment method added:', {
      userId,
      paymentMethodId: paymentMethod.id,
      type: data.type,
    });

    return paymentMethod;
  }

  /**
   * Get a single payment method by ID
   */
  async getPaymentMethod(userId: string, paymentMethodId: string) {
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId,
      },
    });

    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    return {
      id: paymentMethod.id,
      type: paymentMethod.type,
      last4: paymentMethod.last4,
      brand: paymentMethod.brand,
      expiryMonth: paymentMethod.expiryMonth,
      expiryYear: paymentMethod.expiryYear,
      isDefault: paymentMethod.isDefault,
      createdAt: paymentMethod.createdAt,
    };
  }

  /**
   * Set a payment method as default
   */
  async setDefaultPaymentMethod(userId: string, paymentMethodId: string) {
    // Verify ownership
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId,
      },
    });

    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    // Unset other defaults
    await prisma.paymentMethod.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    // Set this as default
    const updated = await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { isDefault: true },
    });

    logger.info('Default payment method updated:', {
      userId,
      paymentMethodId,
    });

    return updated;
  }

  /**
   * Delete a payment method
   */
  async deletePaymentMethod(userId: string, paymentMethodId: string) {
    // Verify ownership
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId,
      },
    });

    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    // If this was the default, set another as default if exists
    if (paymentMethod.isDefault) {
      const anotherMethod = await prisma.paymentMethod.findFirst({
        where: {
          userId,
          id: { not: paymentMethodId },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (anotherMethod) {
        await prisma.paymentMethod.update({
          where: { id: anotherMethod.id },
          data: { isDefault: true },
        });
      }
    }

    // Delete from Razorpay if token exists
    if (paymentMethod.razorpayTokenId) {
      try {
        // Note: Razorpay doesn't have a direct token deletion API
        // Tokens automatically expire or can be managed via dashboard
        logger.info('Payment method token should be managed in Razorpay dashboard:', {
          tokenId: paymentMethod.razorpayTokenId,
        });
      } catch (error) {
        logger.error('Failed to handle Razorpay token:', error);
      }
    }

    // Delete from database
    await prisma.paymentMethod.delete({
      where: { id: paymentMethodId },
    });

    logger.info('Payment method deleted:', {
      userId,
      paymentMethodId,
    });

    return { success: true };
  }

  /**
   * Create a Razorpay customer (for saving payment methods)
   */
  async createCustomer(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    try {
      const customer = await razorpay.customers.create({
        name: user.name,
        email: user.email,
        fail_existing: 0, // Don't fail if customer already exists
        notes: {
          userId: user.id,
        },
      });

      logger.info('Razorpay customer created:', {
        userId,
        customerId: customer.id,
      });

      return customer;
    } catch (error) {
      logger.error('Failed to create Razorpay customer:', error);
      throw error;
    }
  }

  /**
   * Fetch saved cards from Razorpay customer
   */
  async fetchCustomerTokens(customerId: string) {
    try {
      const tokens = await razorpay.customers.fetchTokens(customerId);
      return tokens.items || [];
    } catch (error) {
      logger.error('Failed to fetch customer tokens:', error);
      throw error;
    }
  }

  /**
   * Delete a token from Razorpay customer
   */
  async deleteCustomerToken(customerId: string, tokenId: string) {
    try {
      await razorpay.customers.deleteToken(customerId, tokenId);
      logger.info('Customer token deleted:', { customerId, tokenId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete customer token:', error);
      throw error;
    }
  }
}

export default new PaymentMethodService();

