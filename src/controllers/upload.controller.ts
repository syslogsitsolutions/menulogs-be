/**
 * Upload Controller
 * 
 * Handles file upload endpoints for S3 storage.
 * 
 * @module controllers/upload
 */

import { Request, Response, NextFunction } from 'express';
import {
  uploadToS3,
  deleteFromS3,
  extractS3KeyFromUrl,
  deleteUploadRecord,
  EntityType,
} from '../services/upload.service';
import { validateImageFile, processImage } from '../utils/image.util';
import { logger } from '../utils/logger.util';
import prisma from '../config/database';
import usageTrackingService from '../services/usageTracking.service';

export class UploadController {
  /**
   * Upload a single image
   * POST /api/v1/upload/image
   */
  async uploadImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { entityType, entityId, filename } = req.body;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      if (!entityType || !entityId) {
        res.status(400).json({ error: 'entityType and entityId are required' });
        return;
      }

      // Validate entity type
      const validEntityTypes: EntityType[] = ['business', 'category', 'menu-item', 'banner'];
      if (!validEntityTypes.includes(entityType as EntityType)) {
        res.status(400).json({
          error: `Invalid entityType. Must be one of: ${validEntityTypes.join(', ')}`,
        });
        return;
      }

      // Validate image file
      await validateImageFile(file);

      // Optional: Process image (resize, optimize)
      let processedBuffer = file.buffer;
      try {
        processedBuffer = await processImage(file.buffer, {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 85,
        });
      } catch (error) {
        logger.warn('Image processing failed, using original:', error);
        // Continue with original if processing fails
      }

      // Create file object with processed buffer
      const processedFile = {
        ...file,
        buffer: processedBuffer,
        size: processedBuffer.length,
      };

      // Upload to S3
      const result = await uploadToS3({
        file: processedFile,
        entityType: entityType as EntityType,
        entityId,
        userId,
        filename,
      });

      // Track storage and monthly upload usage after successful upload
      // Note: Limits are checked by middleware, we only track here
      // Get locationId from entity if it's a location-related entity
      if (entityType === 'menu-item' || entityType === 'category' || entityType === 'banner') {
        // Try to get locationId from entity
        let locationId: string | null = null;
        try {
          if (entityType === 'menu-item') {
            const menuItem = await prisma.menuItem.findUnique({
              where: { id: entityId },
              select: { locationId: true },
            });
            locationId = menuItem?.locationId || null;
          } else if (entityType === 'category') {
            const category = await prisma.category.findUnique({
              where: { id: entityId },
              select: { locationId: true },
            });
            locationId = category?.locationId || null;
          } else if (entityType === 'banner') {
            const banner = await prisma.banner.findUnique({
              where: { id: entityId },
              select: { locationId: true },
            });
            locationId = banner?.locationId || null;
          }

          if (locationId) {
            // Track storage usage
            await usageTrackingService.trackStorageUsage(locationId, processedFile.size);
            // Track monthly image upload
            await usageTrackingService.trackImageUpload(locationId);
          }
        } catch (error) {
          // Log but don't fail the upload if tracking fails
          logger.warn('Failed to track upload usage:', error);
        }
      }

      res.status(200).json({
        message: 'File uploaded successfully',
        upload: {
          id: result.uploadId,
          url: result.url,
          key: result.key,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid') || error.message.includes('exceeds')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      next(error);
    }
  }

  /**
   * Upload multiple images
   * POST /api/v1/upload/images
   */
  async uploadImages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { entityType, entityId } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files provided' });
        return;
      }

      if (!entityType || !entityId) {
        res.status(400).json({ error: 'entityType and entityId are required' });
        return;
      }

      // Validate entity type
      const validEntityTypes: EntityType[] = ['business', 'category', 'menu-item', 'banner'];
      if (!validEntityTypes.includes(entityType as EntityType)) {
        res.status(400).json({
          error: `Invalid entityType. Must be one of: ${validEntityTypes.join(', ')}`,
        });
        return;
      }

      // Validate and process all images
      const uploadPromises = files.map(async (file) => {
        await validateImageFile(file);

        // Optional: Process image
        let processedBuffer = file.buffer;
        try {
          processedBuffer = await processImage(file.buffer, {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 85,
          });
        } catch (error) {
          logger.warn('Image processing failed, using original:', error);
        }

        const processedFile = {
          ...file,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        return uploadToS3({
          file: processedFile,
          entityType: entityType as EntityType,
          entityId,
          userId,
        });
      });

      const results = await Promise.all(uploadPromises);

      // Track storage and monthly upload usage after successful uploads
      // Note: Limits are checked by middleware, we only track here
      if (entityType === 'menu-item' || entityType === 'category' || entityType === 'banner') {
        // Try to get locationId from entity
        let locationId: string | null = null;
        try {
          if (entityType === 'menu-item') {
            const menuItem = await prisma.menuItem.findUnique({
              where: { id: entityId },
              select: { locationId: true },
            });
            locationId = menuItem?.locationId || null;
          } else if (entityType === 'category') {
            const category = await prisma.category.findUnique({
              where: { id: entityId },
              select: { locationId: true },
            });
            locationId = category?.locationId || null;
          } else if (entityType === 'banner') {
            const banner = await prisma.banner.findUnique({
              where: { id: entityId },
              select: { locationId: true },
            });
            locationId = banner?.locationId || null;
          }

          if (locationId) {
            // Track storage usage for all files
            const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
            await usageTrackingService.trackStorageUsage(locationId, totalBytes);
            // Track monthly image uploads (one per file)
            for (const _file of files) {
              await usageTrackingService.trackImageUpload(locationId);
            }
          }
        } catch (error) {
          // Log but don't fail the upload if tracking fails
          logger.warn('Failed to track upload usage:', error);
        }
      }

      res.status(200).json({
        message: `${results.length} file(s) uploaded successfully`,
        uploads: results.map((result) => ({
          id: result.uploadId,
          url: result.url,
          key: result.key,
        })),
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid') || error.message.includes('exceeds')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      next(error);
    }
  }

  /**
   * Delete an uploaded file
   * DELETE /api/v1/upload/:uploadId
   */
  async deleteUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { uploadId } = req.params;
      const userId = req.user!.userId;

      // Get upload record
      const upload = await prisma.upload.findUnique({
        where: { id: uploadId },
      });

      if (!upload) {
        res.status(404).json({ error: 'Upload not found' });
        return;
      }

      // Verify ownership
      if (upload.userId !== userId) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      // Delete from S3
      if (upload.s3Key) {
        await deleteFromS3(upload.s3Key);
      }

      // Delete record from database
      await deleteUploadRecord(uploadId);

      res.json({ message: 'Upload deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete file by URL (helper endpoint)
   * DELETE /api/v1/upload/url
   */
  async deleteByUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { url } = req.body;
      const userId = req.user!.userId;

      if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
      }

      // Extract S3 key from URL
      const s3Key = extractS3KeyFromUrl(url);

      if (!s3Key) {
        res.status(400).json({ error: 'Invalid S3 URL' });
        return;
      }

      // Find upload record by S3 key
      const upload = await prisma.upload.findFirst({
        where: {
          s3Key,
          userId, // Verify ownership
        },
      });

      if (!upload) {
        res.status(404).json({ error: 'Upload not found or unauthorized' });
        return;
      }

      // Delete from S3
      await deleteFromS3(s3Key);

      // Delete record from database
      await deleteUploadRecord(upload.id);

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export default new UploadController();

