import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { z } from 'zod';
import { uploadToS3, deleteFromS3, extractS3KeyFromUrl } from '../services/upload.service';
import { validateImageFile, processImage } from '../utils/image.util';
import { logger } from '../utils/logger.util';
import { clearMenuCache } from '../utils/cache.util';
import usageTrackingService from '../services/usageTracking.service';

const categorySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  image: z.union([z.string().url(), z.string().startsWith('data:image/')]), // URL or base64
  icon: z.string().default('ChefHat'),
  isVisible: z.boolean().default(true),
});

export class CategoryController {
  // GET /api/v1/locations/:locationId/categories
  async listByLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: { id: locationId, business: { ownerId: userId } },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const categories = await prisma.category.findMany({
        where: { locationId },
        include: {
          _count: { select: { menuItems: true } },
        },
        orderBy: { sortOrder: 'asc' },
      });

      res.json({ categories });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/locations/:locationId/categories
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;
      const file = req.file; // Image file from multipart/form-data
      let bodyData = req.body;

      // Verify ownership
      const location = await prisma.location.findFirst({
        where: { id: locationId, business: { ownerId: userId } },
        select: { id: true, slug: true },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // If file is uploaded, process it and get S3 URL
      let imageUrl: string | undefined;
      if (file) {
        await validateImageFile(file);
        let processedBuffer = file.buffer;
        try {
          processedBuffer = await processImage(file.buffer, {
            maxWidth: 1024,
            maxHeight: 1024,
            quality: 85,
          });
        } catch (error) {
          logger.warn('Category image processing failed, using original:', error);
        }

        const processedFile = {
          ...file,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        const tempId = 'temp-' + Date.now();
        const result = await uploadToS3({
          file: processedFile,
          entityType: 'category',
          entityId: tempId,
          userId,
          filename: 'image',
          locationId,
        });

        imageUrl = result.url;
      } else if (!bodyData.image) {
        res.status(400).json({ error: 'Image is required' });
        return;
      }

      // Note: Usage limit is checked by middleware (checkPlanLimit)
      // We only track usage after successful creation

      const maxOrder = await prisma.category.findFirst({
        where: { locationId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });

      // Parse JSON fields
      const data = categorySchema.parse({
        name: bodyData.name,
        description: bodyData.description || undefined,
        image: imageUrl || bodyData.image, // Use uploaded file URL or provided URL/base64
        icon: bodyData.icon || 'ChefHat',
        isVisible: bodyData.isVisible !== undefined ? bodyData.isVisible === 'true' || bodyData.isVisible === true : true,
      });

      const category = await prisma.category.create({
        data: {
          ...data,
          locationId,
          sortOrder: (maxOrder?.sortOrder || 0) + 1,
        },
      });

      // Track usage after successful creation
      await usageTrackingService.trackCategoryCreation(locationId);

      // Track storage usage if image was uploaded
      // Note: Storage limit is checked by middleware, we only track here
      if (file) {
        await usageTrackingService.trackStorageUsage(locationId, file.size);
      }

      // Update upload record with correct entityId if file was uploaded
      if (file && imageUrl) {
        const uploads = await prisma.upload.findMany({
          where: {
            s3Url: imageUrl,
            entityId: { startsWith: 'temp-' },
          },
          take: 1,
        });
        if (uploads.length > 0) {
          await prisma.upload.update({
            where: { id: uploads[0].id },
            data: { entityId: category.id },
          });
        }
      }

      // Clear menu cache for this location
      await clearMenuCache(locationId, location.slug);

      res.status(201).json({ message: 'Category created', category });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      if (error instanceof Error) {
        if (error.message.includes('Invalid') || error.message.includes('exceeds')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      next(error);
    }
  }

  // PUT /api/v1/categories/:id
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const locationId = req.body.locationId; // Already validated by requireActiveSubscription middleware
      const file = req.file; // Image file from multipart/form-data
      let bodyData = req.body;

      const existing = await prisma.category.findFirst({
        where: { id, locationId, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      // If file is uploaded, process it and get S3 URL
      let imageUrl: string | undefined;
      if (file) {
        await validateImageFile(file);
        let processedBuffer = file.buffer;
        try {
          processedBuffer = await processImage(file.buffer, {
            maxWidth: 1024,
            maxHeight: 1024,
            quality: 85,
          });
        } catch (error) {
          logger.warn('Category image processing failed, using original:', error);
        }

        const processedFile = {
          ...file,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        // Delete old image from S3 if exists
        if (existing.image) {
          const oldS3Key = extractS3KeyFromUrl(existing.image);
          if (oldS3Key) {
            await deleteFromS3(oldS3Key);
          }
        }

        const result = await uploadToS3({
          file: processedFile,
          entityType: 'category',
          entityId: id,
          userId,
          filename: 'image',
          locationId: locationId,
        });

        imageUrl = result.url;
      }

      // Parse JSON fields
      const data = categorySchema.partial().parse({
        name: bodyData.name || undefined,
        description: bodyData.description || undefined,
        image: imageUrl !== undefined ? imageUrl : bodyData.image || undefined,
        icon: bodyData.icon || undefined,
        isVisible: bodyData.isVisible !== undefined ? bodyData.isVisible === 'true' || bodyData.isVisible === true : undefined,
      });

      const category = await prisma.category.update({
        where: { id },
        data,
      });

      // Clear menu cache for this location
      const location = await prisma.location.findUnique({
        where: { id: existing.locationId },
        select: { slug: true },
      });
      await clearMenuCache(existing.locationId, location?.slug);

      res.json({ message: 'Category updated', category });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      if (error instanceof Error) {
        if (error.message.includes('Invalid') || error.message.includes('exceeds')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      next(error);
    }
  }

  // DELETE /api/v1/categories/:id
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const locationId = req.body.locationId;

      if (!locationId) {
        res.status(400).json({ error: 'Location ID is required in request body' });
        return;
      }

      const existing = await prisma.category.findFirst({
        where: { id, locationId, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      // Delete image from S3 if exists
      if (existing.image) {
        const s3Key = extractS3KeyFromUrl(existing.image);
        if (s3Key) {
          await deleteFromS3(s3Key);
        }
      }

      // Get location info before deletion (locationId already from request body)
      const location = await prisma.location.findUnique({
        where: { id: locationId },
        select: { slug: true },
      });

      await prisma.category.delete({ where: { id } });

      // Track deletion - decrement usage counter
      await usageTrackingService.trackCategoryDeletion(locationId);

      // Clear menu cache for this location
      await clearMenuCache(locationId, location?.slug);

      res.json({ message: 'Category deleted' });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/categories/:id/visibility
  async toggleVisibility(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const locationId = req.body.locationId;

      if (!locationId) {
        res.status(400).json({ error: 'Location ID is required in request body' });
        return;
      }

      const existing = await prisma.category.findFirst({
        where: { id, locationId, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      const category = await prisma.category.update({
        where: { id },
        data: { isVisible: !existing.isVisible },
      });

      // Clear menu cache for this location
      const location = await prisma.location.findUnique({
        where: { id: locationId },
        select: { slug: true },
      });
      await clearMenuCache(locationId, location?.slug);

      res.json({ message: 'Visibility updated', category });
    } catch (error) {
      next(error);
    }
  }

}

export default new CategoryController();

