import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { z } from 'zod';
import { uploadToS3, deleteFromS3, extractS3KeyFromUrl } from '../services/upload.service';
import { validateImageFile, processImage } from '../utils/image.util';
import { logger } from '../utils/logger.util';
import { clearBusinessCache, clearAboutPageCache } from '../utils/cache.util';

const businessSchema = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters'),
  logo: z.union([z.string().url(), z.string().startsWith('data:image/')]).optional(), // URL or base64
  description: z.string().optional(),
  // Brand section fields
  brandDescription: z.string().optional(),
  facebookUrl: z.string().url().optional().or(z.literal('')),
  instagramUrl: z.string().url().optional().or(z.literal('')),
  twitterUrl: z.string().url().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  youtubeUrl: z.string().url().optional().or(z.literal('')),
  // About page fields
  aboutContent: z.string().optional(),
  aboutImage: z.union([z.string().url(), z.string().startsWith('data:image/')]).optional(), // URL or base64
});

export class BusinessController {
  // GET /api/v1/businesses
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;

      const businesses = await prisma.business.findMany({
        where: { ownerId: userId },
        include: {
          locations: {
            select: {
              id: true,
              name: true,
              city: true,
              subscriptionStatus: true,
              subscriptionPlan: true,
            },
          },
          _count: {
            select: { locations: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ businesses });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/businesses
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      let bodyData = req.body;

      // Handle logo file upload
      const logoFile = files?.image?.[0];
      let logoUrl: string | undefined;
      if (logoFile) {
        await validateImageFile(logoFile);
        let processedBuffer = logoFile.buffer;
        try {
          processedBuffer = await processImage(logoFile.buffer, {
            maxWidth: 512,
            maxHeight: 512,
            quality: 85,
          });
        } catch (error) {
          logger.warn('Logo processing failed, using original:', error);
        }

        const processedFile = {
          ...logoFile,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        // Create a temporary ID for the upload (we'll get the real ID after creation)
        const tempId = 'temp-' + Date.now();
        const result = await uploadToS3({
          file: processedFile,
          entityType: 'business',
          entityId: tempId,
          userId,
          filename: 'logo',
        });

        logoUrl = result.url;
      }

      // Handle aboutImage file upload
      const aboutImageFile = files?.aboutImage?.[0];
      let aboutImageUrl: string | undefined;
      if (aboutImageFile) {
        await validateImageFile(aboutImageFile);
        let processedBuffer = aboutImageFile.buffer;
        try {
          processedBuffer = await processImage(aboutImageFile.buffer, {
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 85,
          });
        } catch (error) {
          logger.warn('About image processing failed, using original:', error);
        }

        const processedFile = {
          ...aboutImageFile,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        // Create a temporary ID for the upload (we'll get the real ID after creation)
        const tempId = 'temp-' + Date.now();
        const result = await uploadToS3({
          file: processedFile,
          entityType: 'business',
          entityId: tempId,
          userId,
          filename: 'about-image',
        });

        aboutImageUrl = result.url;
      }

      // Parse JSON fields (for multipart/form-data, JSON fields come as strings)
      const data = businessSchema.parse({
        name: bodyData.name,
        logo: logoUrl || bodyData.logo || undefined, // Use uploaded file URL or provided URL/base64
        description: bodyData.description || undefined,
        brandDescription: bodyData.brandDescription || undefined,
        facebookUrl: bodyData.facebookUrl || undefined,
        instagramUrl: bodyData.instagramUrl || undefined,
        twitterUrl: bodyData.twitterUrl || undefined,
        linkedinUrl: bodyData.linkedinUrl || undefined,
        youtubeUrl: bodyData.youtubeUrl || undefined,
        aboutContent: bodyData.aboutContent || undefined,
        aboutImage: aboutImageUrl || bodyData.aboutImage || undefined, // Use uploaded file URL or provided URL/base64
      });

      const business = await prisma.business.create({
        data: {
          ...data,
          ownerId: userId,
        },
        include: {
          locations: true,
        },
      });

      // Update upload record with correct entityId if logo file was uploaded
      if (logoFile && logoUrl) {
        const uploads = await prisma.upload.findMany({
          where: {
            s3Url: logoUrl,
            entityId: { startsWith: 'temp-' },
          },
          take: 1,
        });
        if (uploads.length > 0) {
          await prisma.upload.update({
            where: { id: uploads[0].id },
            data: { entityId: business.id },
          });
        }
      }

      // Update upload record with correct entityId if aboutImage file was uploaded
      if (aboutImageFile && aboutImageUrl) {
        const uploads = await prisma.upload.findMany({
          where: {
            s3Url: aboutImageUrl,
            entityId: { startsWith: 'temp-' },
          },
          take: 1,
        });
        if (uploads.length > 0) {
          await prisma.upload.update({
            where: { id: uploads[0].id },
            data: { entityId: business.id },
          });
        }
      }

      res.status(201).json({
        message: 'Business created successfully',
        business,
      });
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

  // GET /api/v1/businesses/:id
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const business = await prisma.business.findFirst({
        where: {
          id,
          ownerId: userId,
        },
        include: {
          locations: true,
        },
      });

      if (!business) {
        res.status(404).json({ error: 'Business not found' });
        return;
      }

      res.json({ business });
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/v1/businesses/:id
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      let bodyData = req.body;

      // Check ownership
      const existing = await prisma.business.findFirst({
        where: { id, ownerId: userId },
      });

      if (!existing) {
        res.status(404).json({ error: 'Business not found' });
        return;
      }

      // Handle logo file upload
      const logoFile = files?.image?.[0];
      let logoUrl: string | undefined;
      if (logoFile) {
        await validateImageFile(logoFile);
        let processedBuffer = logoFile.buffer;
        try {
          processedBuffer = await processImage(logoFile.buffer, {
            maxWidth: 512,
            maxHeight: 512,
            quality: 85,
          });
        } catch (error) {
          logger.warn('Logo processing failed, using original:', error);
        }

        const processedFile = {
          ...logoFile,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        // Delete old logo from S3 if exists
        if (existing.logo) {
          const oldS3Key = extractS3KeyFromUrl(existing.logo);
          if (oldS3Key) {
            await deleteFromS3(oldS3Key);
          }
        }

        const result = await uploadToS3({
          file: processedFile,
          entityType: 'business',
          entityId: id,
          userId,
          filename: 'logo',
        });

        logoUrl = result.url;
      }

      // Handle aboutImage file upload
      const aboutImageFile = files?.aboutImage?.[0];
      let aboutImageUrl: string | undefined;
      if (aboutImageFile) {
        await validateImageFile(aboutImageFile);
        let processedBuffer = aboutImageFile.buffer;
        try {
          processedBuffer = await processImage(aboutImageFile.buffer, {
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 85,
          });
        } catch (error) {
          logger.warn('About image processing failed, using original:', error);
        }

        const processedFile = {
          ...aboutImageFile,
          buffer: processedBuffer,
          size: processedBuffer.length,
        };

        // Delete old aboutImage from S3 if exists
        if (existing.aboutImage) {
          const oldS3Key = extractS3KeyFromUrl(existing.aboutImage);
          if (oldS3Key) {
            await deleteFromS3(oldS3Key);
          }
        }

        const result = await uploadToS3({
          file: processedFile,
          entityType: 'business',
          entityId: id,
          userId,
          filename: 'about-image',
        });

        aboutImageUrl = result.url;
      }

      // Parse JSON fields (for multipart/form-data, JSON fields come as strings)
      const data = businessSchema.partial().parse({
        name: bodyData.name || undefined,
        logo: logoUrl !== undefined ? logoUrl : bodyData.logo || undefined,
        description: bodyData.description || undefined,
        brandDescription: bodyData.brandDescription !== undefined ? bodyData.brandDescription : undefined,
        facebookUrl: bodyData.facebookUrl || undefined,
        instagramUrl: bodyData.instagramUrl || undefined,
        twitterUrl: bodyData.twitterUrl || undefined,
        linkedinUrl: bodyData.linkedinUrl || undefined,
        youtubeUrl: bodyData.youtubeUrl || undefined,
        aboutContent: bodyData.aboutContent !== undefined ? bodyData.aboutContent : undefined,
        aboutImage: aboutImageUrl !== undefined ? aboutImageUrl : bodyData.aboutImage || undefined,
      });

      const business = await prisma.business.update({
        where: { id },
        data,
      });

      // Clear cache for all locations of this business
      await clearBusinessCache(id);
      
      // If aboutContent or aboutImage was updated, also clear about page cache for all locations
      if (data.aboutContent !== undefined || data.aboutImage !== undefined) {
        const locations = await prisma.location.findMany({
          where: { businessId: id },
          select: { slug: true },
        });
        for (const location of locations) {
          if (location.slug) {
            await clearAboutPageCache(location.slug);
          }
        }
      }

      res.json({
        message: 'Business updated successfully',
        business,
      });
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

  // DELETE /api/v1/businesses/:id
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      // Check ownership
      const existing = await prisma.business.findFirst({
        where: { id, ownerId: userId },
      });

      if (!existing) {
        res.status(404).json({ error: 'Business not found' });
        return;
      }

      // Delete logo from S3 if exists
      if (existing.logo) {
        const s3Key = extractS3KeyFromUrl(existing.logo);
        if (s3Key) {
          await deleteFromS3(s3Key);
        }
      }

      await prisma.business.delete({ where: { id } });

      res.json({ message: 'Business deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

}

export default new BusinessController();

