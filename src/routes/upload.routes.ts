/**
 * Upload Routes
 * 
 * Routes for file upload endpoints.
 * 
 * @module routes/upload
 */

import { Router } from 'express';
import uploadController from '../controllers/upload.controller';
import { uploadSingle, uploadMultiple } from '../middleware/upload.middleware';
import { authenticate } from '../middleware/auth.middleware';
import {
  requireActiveSubscription,
  checkStorageLimit,
  checkMonthlyUploadLimit,
} from '../middleware/subscription.middleware';

const router = Router();

// All upload routes require authentication
router.use(authenticate);

// Upload single image
router.post(
  '/image',
  requireActiveSubscription,
  checkStorageLimit,
  checkMonthlyUploadLimit('image'),
  uploadSingle,
  uploadController.uploadImage.bind(uploadController)
);

// Upload multiple images
router.post(
  '/images',
  requireActiveSubscription,
  checkStorageLimit,
  checkMonthlyUploadLimit('image'),
  uploadMultiple,
  uploadController.uploadImages.bind(uploadController)
);

// Delete upload by ID
router.delete(
  '/:uploadId',
  requireActiveSubscription,
  uploadController.deleteUpload.bind(uploadController)
);

// Delete upload by URL
router.delete(
  '/url',
  requireActiveSubscription,
  uploadController.deleteByUrl.bind(uploadController)
);

export default router;

