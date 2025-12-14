import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { z } from 'zod';
import { uploadToS3, deleteFromS3, extractS3KeyFromUrl } from '../services/upload.service';
import { validateImageFile, processImage } from '../utils/image.util';
import { logger } from '../utils/logger.util';
import { clearFeaturedSectionCache } from '../utils/cache.util';

const featureSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

const featuredSectionSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  image: z.union([z.string().url(), z.string().startsWith('data:image/')]), // URL or base64
  features: z.array(featureSchema).min(1),
  buttonText: z.string().optional(),
  buttonLink: z.string().url().optional().or(z.literal('')),
  imagePosition: z.enum(['left', 'right']).default('left'),
  isActive: z.boolean().default(true),
});

export class FeaturedSectionController {
  // GET /api/v1/locations/:locationId/featured-sections
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

      const featuredSections = await prisma.featuredSection.findMany({
        where: { locationId },
        orderBy: { sortOrder: 'asc' },
      });

      res.json({ featuredSections });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/locations/:locationId/featured-sections
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;
      const file = req.file; // Image file from multipart/form-data
      let bodyData = req.body;

      const location = await prisma.location.findFirst({
        where: { id: locationId, business: { ownerId: userId } },
        select: { id: true, slug: true, businessId: true },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Parse applyToAllLocations flag
      const applyToAllLocations = bodyData.applyToAllLocations === 'true' || bodyData.applyToAllLocations === true;

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
          logger.warn('Featured section image processing failed, using original:', error);
        }

        const processedFile = {
          ...file,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        const tempId = 'temp-' + Date.now();
        const result = await uploadToS3({
          file: processedFile,
          entityType: 'featured-section',
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

      // Parse features JSON if it's a string
      let features: Array<{ title: string; description: string }> = [];
      if (bodyData.features) {
        if (typeof bodyData.features === 'string') {
          features = JSON.parse(bodyData.features);
        } else {
          features = bodyData.features;
        }
      }

      // Parse JSON fields
      const data = featuredSectionSchema.parse({
        title: bodyData.title,
        description: bodyData.description || undefined,
        image: imageUrl || bodyData.image,
        features,
        buttonText: bodyData.buttonText || undefined,
        buttonLink: bodyData.buttonLink || undefined,
        imagePosition: bodyData.imagePosition || 'left',
        isActive: bodyData.isActive !== undefined ? bodyData.isActive === 'true' || bodyData.isActive === true : true,
      });

      if (applyToAllLocations) {
        // Get all locations for this business
        const allLocations = await prisma.location.findMany({
          where: { businessId: location.businessId },
          select: { id: true, slug: true },
        });

        const createdSections = [];
        const errors = [];

        for (const loc of allLocations) {
          try {
            const maxOrder = await prisma.featuredSection.findFirst({
              where: { locationId: loc.id },
              orderBy: { sortOrder: 'desc' },
              select: { sortOrder: true },
            });

            const section = await prisma.featuredSection.create({
              data: {
                ...data,
                locationId: loc.id,
                sortOrder: (maxOrder?.sortOrder || 0) + 1,
              },
            });

            createdSections.push(section);

            // Clear cache for this location
            await clearFeaturedSectionCache(loc.id, loc.slug);
          } catch (error) {
            errors.push({ locationId: loc.id, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }

        // Update upload record with correct entityId if file was uploaded
        if (file && imageUrl && createdSections.length > 0) {
          const uploads = await prisma.upload.findMany({
            where: {
              s3Url: imageUrl,
              entityId: { startsWith: 'temp-' },
            },
            take: 1,
          });
          if (uploads.length > 0) {
            // Update with first created section ID
            await prisma.upload.update({
              where: { id: uploads[0].id },
              data: { entityId: createdSections[0].id },
            });
          }
        }

        res.status(201).json({
          message: `Featured section created for ${createdSections.length} location(s)`,
          featuredSections: createdSections,
          errors: errors.length > 0 ? errors : undefined,
        });
      } else {
        // Create for single location
        const maxOrder = await prisma.featuredSection.findFirst({
          where: { locationId },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });

        const featuredSection = await prisma.featuredSection.create({
          data: {
            ...data,
            locationId,
            sortOrder: (maxOrder?.sortOrder || 0) + 1,
          },
        });

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
              data: { entityId: featuredSection.id },
            });
          }
        }

        // Clear menu cache for this location
        await clearFeaturedSectionCache(locationId, location.slug);

        res.status(201).json({ message: 'Featured section created', featuredSection });
      }
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

  // PUT /api/v1/featured-sections/:id
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const file = req.file; // Image file from multipart/form-data
      let bodyData = req.body;

      const existing = await prisma.featuredSection.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Featured section not found' });
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
          logger.warn('Featured section image processing failed, using original:', error);
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

        // Get locationId from existing section
        const sectionLocation = existing.locationId;
        
        const result = await uploadToS3({
          file: processedFile,
          entityType: 'featured-section',
          entityId: id,
          userId,
          filename: 'image',
          locationId: sectionLocation,
        });

        imageUrl = result.url;
      }

      // Parse features JSON if it's a string
      let features: Array<{ title: string; description: string }> | undefined = undefined;
      if (bodyData.features !== undefined) {
        if (typeof bodyData.features === 'string') {
          features = JSON.parse(bodyData.features);
        } else {
          features = bodyData.features;
        }
      }

      // Parse JSON fields
      const data = featuredSectionSchema.partial().parse({
        title: bodyData.title || undefined,
        description: bodyData.description !== undefined ? bodyData.description : undefined,
        image: imageUrl !== undefined ? imageUrl : bodyData.image || undefined,
        features: features,
        buttonText: bodyData.buttonText !== undefined ? bodyData.buttonText : undefined,
        buttonLink: bodyData.buttonLink !== undefined ? bodyData.buttonLink : undefined,
        imagePosition: bodyData.imagePosition || undefined,
        isActive: bodyData.isActive !== undefined ? bodyData.isActive === 'true' || bodyData.isActive === true : undefined,
      });

      const featuredSection = await prisma.featuredSection.update({
        where: { id },
        data,
      });

      // Clear menu cache for this location
      const location = await prisma.location.findUnique({
        where: { id: existing.locationId },
        select: { slug: true },
      });
      await clearFeaturedSectionCache(existing.locationId, location?.slug);

      res.json({ message: 'Featured section updated', featuredSection });
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

  // DELETE /api/v1/featured-sections/:id
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.featuredSection.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Featured section not found' });
        return;
      }

      // Delete image from S3 if exists
      if (existing.image) {
        const s3Key = extractS3KeyFromUrl(existing.image);
        if (s3Key) {
          await deleteFromS3(s3Key);
        }
      }

      // Get location info before deletion
      const locationId = existing.locationId;
      const location = await prisma.location.findUnique({
        where: { id: locationId },
        select: { slug: true },
      });

      await prisma.featuredSection.delete({ where: { id } });

      // Clear menu cache for this location
      await clearFeaturedSectionCache(locationId, location?.slug);

      res.json({ message: 'Featured section deleted' });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/featured-sections/:id/toggle
  async toggleActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.featuredSection.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Featured section not found' });
        return;
      }

      const featuredSection = await prisma.featuredSection.update({
        where: { id },
        data: { isActive: !existing.isActive },
      });

      // Clear menu cache for this location
      const location = await prisma.location.findUnique({
        where: { id: existing.locationId },
        select: { slug: true },
      });
      await clearFeaturedSectionCache(existing.locationId, location?.slug);

      res.json({ message: 'Featured section status updated', featuredSection });
    } catch (error) {
      next(error);
    }
  }
}

export default new FeaturedSectionController();

