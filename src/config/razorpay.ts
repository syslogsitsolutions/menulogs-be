/**
 * Razorpay Payment Gateway Configuration
 * 
 * This module initializes and exports the Razorpay instance for payment processing.
 * Includes proper error handling, validation, and logging.
 * 
 * @module config/razorpay
 */

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { logger } from '../utils/logger.util';

// Validate Razorpay credentials
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  logger.error('Razorpay credentials are not configured. Payment features will be disabled.');
}

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID || '',
  key_secret: RAZORPAY_KEY_SECRET || '',
});

/**
 * Verify Razorpay webhook signature
 * @param body - Raw request body
 * @param signature - X-Razorpay-Signature header
 * @returns boolean indicating if signature is valid
 */
export const verifyWebhookSignature = (body: string, signature: string): boolean => {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    logger.warn('Webhook secret not configured. Skipping signature verification.');
    return true; // Allow in development
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('Webhook signature verification failed:', error);
    return false;
  }
};

/**
 * Verify payment signature after payment completion
 * @param orderId - Razorpay order ID
 * @param paymentId - Razorpay payment ID
 * @param signature - Razorpay signature
 * @returns boolean indicating if signature is valid
 */
export const verifyPaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string
): boolean => {
  if (!RAZORPAY_KEY_SECRET) {
    logger.error('Razorpay key secret not configured');
    return false;
  }

  try {
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('Payment signature verification failed:', error);
    return false;
  }
};

/**
 * Verify subscription signature
 * @param subscriptionId - Razorpay subscription ID
 * @param paymentId - Razorpay payment ID
 * @param signature - Razorpay signature
 * @returns boolean indicating if signature is valid
 */
export const verifySubscriptionSignature = (
  subscriptionId: string,
  paymentId: string,
  signature: string
): boolean => {
  if (!RAZORPAY_KEY_SECRET) {
    logger.error('Razorpay key secret not configured');
    return false;
  }

  try {
    const body = `${subscriptionId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('Subscription signature verification failed:', error);
    return false;
  }
};

/**
 * Check if Razorpay is configured
 */
export const isRazorpayConfigured = (): boolean => {
  return !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
};

/**
 * Get Razorpay public key for frontend
 */
export const getRazorpayKeyId = (): string => {
  return RAZORPAY_KEY_ID || '';
};

export default razorpay;

