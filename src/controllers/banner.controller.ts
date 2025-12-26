import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { z } from 'zod';
import { uploadToS3, deleteFromS3, extractS3KeyFromUrl } from '../services/upload.service';
import { validateImageFile, processImage } from '../utils/image.util';
import { logger } from '../utils/logger.util';
import { clearMenuCache } from '../utils/cache.util';
import usageTrackingService from '../services/usageTracking.service';

const bannerSchema = z.object({
  title: z.string().min(2),
  subtitle: z.string().optional(),
  image: z.union([z.string().url(), z.string().startsWith('data:image/')]), // URL or base64
  video: z.string().url().optional(),
  link: z.string().url().optional(),
  isActive: z.boolean().default(true),
});

export class BannerController {
  // GET /api/v1/locations/:locationId/banners
  async listByLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;

      const location = await prisma.location.findFirst({
        where: { id: locationId, business: { ownerId: userId } },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const banners = await prisma.banner.findMany({
        where: { locationId },
        orderBy: { sortOrder: 'asc' },
      });

      res.json({ banners });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/locations/:locationId/banners
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;
      const file = req.file; // Image file from multipart/form-data
      let bodyData = req.body;

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
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 85,
          });
        } catch (error) {
          logger.warn('Banner image processing failed, using original:', error);
        }

        const processedFile = {
          ...file,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        const tempId = 'temp-' + Date.now();
        const result = await uploadToS3({
          file: processedFile,
          entityType: 'banner',
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

      const maxOrder = await prisma.banner.findFirst({
        where: { locationId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });

      // Parse JSON fields
      const data = bannerSchema.parse({
        title: bodyData.title,
        subtitle: bodyData.subtitle || undefined,
        image: imageUrl || bodyData.image, // Use uploaded file URL or provided URL/base64
        video: bodyData.video || undefined,
        link: bodyData.link || undefined,
        isActive: bodyData.isActive !== undefined ? bodyData.isActive === 'true' || bodyData.isActive === true : true,
      });

      const banner = await prisma.banner.create({
        data: {
          ...data,
          locationId,
          sortOrder: (maxOrder?.sortOrder || 0) + 1,
        },
      });

      // Track storage usage if image was uploaded
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
            data: { entityId: banner.id },
          });
        }
      }

      // Clear menu cache for this location
      await clearMenuCache(locationId, location.slug);

      res.status(201).json({ message: 'Banner created', banner });
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

  // PUT /api/v1/banners/:id
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const locationId = req.body.locationId; // Already validated by requireActiveSubscription middleware
      const file = req.file; // Image file from multipart/form-data
      let bodyData = req.body;

      const existing = await prisma.banner.findFirst({
        where: { id, locationId, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Banner not found' });
        return;
      }

      // If file is uploaded, process it and get S3 URL
      let imageUrl: string | undefined;
      if (file) {
        await validateImageFile(file);
        let processedBuffer = file.buffer;
        try {
          processedBuffer = await processImage(file.buffer, {
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 85,
          });
        } catch (error) {
          logger.warn('Banner image processing failed, using original:', error);
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
          entityType: 'banner',
          entityId: id,
          userId,
          filename: 'image',
          locationId: locationId,
        });

        imageUrl = result.url;
      }

      // Parse JSON fields
      const data = bannerSchema.partial().parse({
        title: bodyData.title || undefined,
        subtitle: bodyData.subtitle || undefined,
        image: imageUrl !== undefined ? imageUrl : bodyData.image || undefined,
        video: bodyData.video || undefined,
        link: bodyData.link || undefined,
        isActive: bodyData.isActive !== undefined ? bodyData.isActive === 'true' || bodyData.isActive === true : undefined,
      });

      const banner = await prisma.banner.update({
        where: { id },
        data,
      });

      // Clear menu cache for this location
      const location = await prisma.location.findUnique({
        where: { id: existing.locationId },
        select: { slug: true },
      });
      await clearMenuCache(existing.locationId, location?.slug);

      res.json({ message: 'Banner updated', banner });
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

  // DELETE /api/v1/banners/:id
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const locationId = req.body.locationId;

      if (!locationId) {
        res.status(400).json({ error: 'Location ID is required in request body' });
        return;
      }

      const existing = await prisma.banner.findFirst({
        where: { id, locationId, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Banner not found' });
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

      await prisma.banner.delete({ where: { id } });

      // Track deletion - decrement usage counter
      await usageTrackingService.trackBannerDeletion(locationId);

      // Clear menu cache for this location
      await clearMenuCache(locationId, location?.slug);

      res.json({ message: 'Banner deleted' });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/banners/:id/toggle
  async toggleActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const locationId = req.body.locationId;

      if (!locationId) {
        res.status(400).json({ error: 'Location ID is required in request body' });
        return;
      }

      const existing = await prisma.banner.findFirst({
        where: { id, locationId, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Banner not found' });
        return;
      }

      const banner = await prisma.banner.update({
        where: { id },
        data: { isActive: !existing.isActive },
      });

      // Clear menu cache for this location
      const location = await prisma.location.findUnique({
        where: { id: locationId },
        select: { slug: true },
      });
      await clearMenuCache(locationId, location?.slug);

      res.json({ message: 'Banner status updated', banner });
    } catch (error) {
      next(error);
    }
  }

}

export default new BannerController();

