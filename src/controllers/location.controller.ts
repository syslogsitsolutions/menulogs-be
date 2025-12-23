import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { z } from 'zod';
import {
  generateUniqueSlug,
  isSlugAvailable,
  getSlugValidationError,
} from '../utils/slug.util';
import { clearLocationCache } from '../utils/cache.util';
import { uploadToS3, deleteFromS3, extractS3KeyFromUrl } from '../services/upload.service';
import { validateImageFile, processImage } from '../utils/image.util';
import { logger } from '../utils/logger.util';
import usageTrackingService from '../services/usageTracking.service';
import { serializeLocation, serializeLocations } from '../utils/serialization.util';

const locationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(3).max(50).optional(),
  address: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(2),
  zipCode: z.string(),
  country: z.string().default('USA'),
  phone: z.string(),
  email: z.string().email(),
  isActive: z.boolean().default(true),
  openingHours: z.any(),
  // Contact page fields
  contactContent: z.string().optional(),
  contactImage: z.string().url().optional().or(z.string().startsWith('data:image/')).optional(),
  mapEmbedUrl: z.string().url().optional().or(z.literal('')),
  // Brand customization
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export class LocationController {
  // GET /api/v1/locations
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;

      const locations = await prisma.location.findMany({
        where: {
          business: {
            ownerId: userId,
          },
        },
        include: {
          business: {
            select: { id: true, name: true },
          },
          _count: {
            select: {
              categories: true,
              menuItems: true,
              banners: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ locations: serializeLocations(locations) });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/locations
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      let bodyData = req.body;
      
      // Handle contactImage file upload
      const contactImageFile = files?.contactImage?.[0];
      let contactImageUrl: string | undefined;
      if (contactImageFile) {
        await validateImageFile(contactImageFile);
        let processedBuffer = contactImageFile.buffer;
        try {
          processedBuffer = await processImage(contactImageFile.buffer, {
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 85,
          });
        } catch (error) {
          logger.warn('Contact image processing failed, using original:', error);
        }

        const processedFile = {
          ...contactImageFile,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        const tempId = 'temp-' + Date.now();
        const result = await uploadToS3({
          file: processedFile,
          entityType: 'location',
          entityId: tempId,
          userId,
          filename: 'contact-image',
        });

        contactImageUrl = result.url;
      }

      // Parse boolean fields from FormData (they come as strings)
      const parsedBodyData = {
        ...bodyData,
        isActive: bodyData.isActive === 'true' || bodyData.isActive === true,
      };

      const data = locationSchema.parse({
        ...parsedBodyData,
        contactImage: contactImageUrl || bodyData.contactImage || undefined,
      });
      const { businessId } = bodyData;

      // Verify business ownership
      const business = await prisma.business.findFirst({
        where: { id: businessId, ownerId: userId },
      });

      if (!business) {
        res.status(404).json({ error: 'Business not found' });
        return;
      }

      // Handle slug
      let slug: string;
      
      if (data.slug) {
        // Validate provided slug
        const slugError = getSlugValidationError(data.slug);
        if (slugError) {
          res.status(400).json({ error: slugError });
          return;
        }

        // Check if slug is available
        const available = await isSlugAvailable(data.slug);
        if (!available) {
          res.status(409).json({ error: 'Slug is already taken' });
          return;
        }

        slug = data.slug;
      } else {
        // Auto-generate unique slug from name and city
        slug = await generateUniqueSlug(`${data.name}-${data.city}`);
      }

      // Set trial period (14 days)
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      // Set monthly upload reset date to next month
      const monthlyUploadResetDate = new Date();
      monthlyUploadResetDate.setMonth(monthlyUploadResetDate.getMonth() + 1);
      monthlyUploadResetDate.setDate(1);
      monthlyUploadResetDate.setHours(0, 0, 0, 0);

      const location = await prisma.location.create({
        data: {
          name: data.name,
          slug,
          address: data.address,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
          country: data.country,
          phone: data.phone,
          email: data.email,
          isActive: data.isActive,
          openingHours: data.openingHours,
          contactContent: data.contactContent || undefined,
          contactImage: data.contactImage || undefined,
          mapEmbedUrl: data.mapEmbedUrl || undefined,
          brandColor: data.brandColor || undefined,
          businessId,
          trialEndsAt,
          // Initialize subscription (FREE plan with trial)
          subscriptionPlan: 'FREE',
          subscriptionStatus: 'TRIAL',
          // Initialize usage counters
          currentMenuItems: 0,
          currentCategories: 0,
          currentBanners: 0,
          currentFeaturedSections: 0,
          currentStorageBytes: BigInt(0),
          monthlyImageUploads: 0,
          monthlyVideoUploads: 0,
          monthlyUploadResetDate,
          lastUsageUpdate: new Date(),
        },
      });

      // Update upload record with correct entityId if contactImage file was uploaded
      if (contactImageFile && contactImageUrl) {
        const uploads = await prisma.upload.findMany({
          where: {
            s3Url: contactImageUrl,
            entityId: { startsWith: 'temp-' },
          },
          take: 1,
        });
        if (uploads.length > 0) {
          await prisma.upload.update({
            where: { id: uploads[0].id },
            data: { entityId: location.id },
          });
        }
      }

      res.status(201).json({
        message: 'Location created successfully',
        location: serializeLocation(location),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // GET /api/v1/locations/:id
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const location = await prisma.location.findFirst({
        where: {
          id,
          business: { ownerId: userId },
        },
        include: {
          business: true,
          subscription: true,
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Get usage summary for location
      let usageSummary;
      try {
        usageSummary = await usageTrackingService.getUsageSummary(location.id);
      } catch (error) {
        logger.warn('Failed to get usage summary:', error);
      }

      res.json({
        location: serializeLocation(location),
        usage: usageSummary,
      });
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/v1/locations/:id
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      let bodyData = req.body;

      // Check ownership
      const existing = await prisma.location.findFirst({
        where: {
          id,
          business: { ownerId: userId },
        },
      });

      if (!existing) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Handle contactImage file upload
      const contactImageFile = files?.contactImage?.[0];
      let contactImageUrl: string | undefined;
      if (contactImageFile) {
        await validateImageFile(contactImageFile);
        let processedBuffer = contactImageFile.buffer;
        try {
          processedBuffer = await processImage(contactImageFile.buffer, {
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 85,
          });
        } catch (error) {
          logger.warn('Contact image processing failed, using original:', error);
        }

        const processedFile = {
          ...contactImageFile,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        // Delete old contactImage from S3 if exists
        if (existing.contactImage) {
          const oldS3Key = extractS3KeyFromUrl(existing.contactImage);
          if (oldS3Key) {
            await deleteFromS3(oldS3Key);
          }
        }

        const result = await uploadToS3({
          file: processedFile,
          entityType: 'location',
          entityId: id,
          userId,
          filename: 'contact-image',
        });

        contactImageUrl = result.url;
      }

      // Handle slug update if provided
      if (bodyData.slug) {
        // Validate slug format
        const slugError = getSlugValidationError(bodyData.slug);
        if (slugError) {
          res.status(400).json({ error: slugError });
          return;
        }

        // Check if slug is available (excluding current location)
        const available = await isSlugAvailable(bodyData.slug, id);
        if (!available) {
          res.status(409).json({ error: 'Slug is already taken' });
          return;
        }
      }

      // Parse boolean fields from FormData (they come as strings)
      const parsedBodyData: any = {
        ...bodyData,
      };
      if (bodyData.isActive !== undefined) {
        parsedBodyData.isActive = bodyData.isActive === 'true' || bodyData.isActive === true;
      }

      const data = locationSchema.partial().parse({
        ...parsedBodyData,
        contactImage: contactImageUrl !== undefined ? contactImageUrl : bodyData.contactImage || undefined,
      });

      const location = await prisma.location.update({
        where: { id },
        data,
        select: { id: true, slug: true },
      });

      // Clear cache for this location
      await clearLocationCache(location.id, location.slug);

      // Get full location data for response
      const fullLocation = await prisma.location.findUnique({
        where: { id },
        include: {
          business: true,
          subscription: true,
        },
      });

      res.json({
        message: 'Location updated successfully',
        location: fullLocation,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // DELETE /api/v1/locations/:id
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.location.findFirst({
        where: {
          id,
          business: { ownerId: userId },
        },
      });

      if (!existing) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Get location info before deletion
      const locationId = existing.id;
      const slug = existing.slug;

      await prisma.location.delete({ where: { id } });

      // Clear cache for this location
      await clearLocationCache(locationId, slug);

      res.json({ message: 'Location deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/locations/check-slug/:slug
  async checkSlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const { excludeId } = req.query;

      // Validate slug format
      const slugError = getSlugValidationError(slug);
      if (slugError) {
        res.json({
          available: false,
          error: slugError,
        });
        return;
      }

      // Check availability
      const available = await isSlugAvailable(slug, excludeId as string | undefined);

      res.json({
        available,
        slug,
        ...(available ? { message: 'Slug is available' } : { error: 'Slug is already taken' }),
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new LocationController();

