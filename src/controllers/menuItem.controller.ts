import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { z } from 'zod';
import { uploadToS3, deleteMultipleFromS3, extractS3KeyFromUrl } from '../services/upload.service';
import { validateImageFile, processImage } from '../utils/image.util';
import { logger } from '../utils/logger.util';
import { clearMenuCache } from '../utils/cache.util';

// Helper to validate image string (URL or base64 data URL)
const imageString = z.string().refine(
  (val) => {
    // Accept URLs
    try {
      new URL(val);
      return true;
    } catch {
      // Accept base64 data URLs
      return val.startsWith('data:image/');
    }
  },
  { message: 'Image must be a valid URL or base64 data URL' }
);

const menuItemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string(),
  price: z.number().positive(),
  image: imageString.optional(),
  images: z.array(imageString).max(4, 'Maximum 4 images allowed').default([]),
  video: z.string().url().optional(),
  ingredients: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  nutritionalInfo: z.any().optional(),
  isVegetarian: z.boolean().default(false),
  isVegan: z.boolean().default(false),
  isGlutenFree: z.boolean().default(false),
  spicyLevel: z.number().int().min(0).max(5).optional(),
  availability: z.enum(['IN_STOCK', 'OUT_OF_STOCK', 'HIDDEN']).default('IN_STOCK'),
  preparationTime: z.string().optional(),
});

export class MenuItemController {
  // GET /api/v1/locations/:locationId/menu-items
  async listByLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;
      const { categoryId, availability, search } = req.query;

      const location = await prisma.location.findFirst({
        where: { id: locationId, business: { ownerId: userId } },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const where: any = { locationId };
      if (categoryId) where.categoryId = categoryId;
      if (availability) where.availability = availability;
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const menuItems = await prisma.menuItem.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
        },
        orderBy: { sortOrder: 'asc' },
      });

      res.json({ menuItems });
    } catch (error) {
      next(error);
    }
  }

  // Helper method to normalize image data
  private normalizeImageData(data: any): { image: string; images: string[] } {
    let images: string[] = [];
    
    // If images array is provided, use it
    if (data.images && Array.isArray(data.images)) {
      images = [...data.images];
    }
    
    // If image field is provided, handle it
    if (data.image) {
      // If images array is empty or doesn't start with the image field value, add/update it
      if (images.length === 0 || images[0] !== data.image) {
        // Remove the image value from array if it exists elsewhere
        images = images.filter(img => img !== data.image);
        // Add to the beginning (main image at index 0)
        images.unshift(data.image);
      }
    }
    
    // Ensure maximum 3 images
    images = images.slice(0, 3);
    
    // Ensure we have at least one image (main image)
    if (images.length === 0) {
      throw new Error('At least one image is required');
    }
    
    return {
      image: images[0], // Main image is always at index 0
      images: images,
    };
  }

  // POST /api/v1/locations/:locationId/menu-items
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;
      
      // Handle both uploadFields (object) and uploadMultiple (array) formats
      let files: Express.Multer.File[] | undefined;
      if (req.files) {
        if (Array.isArray(req.files)) {
          files = req.files;
        } else {
          // uploadFields format: { image?: File[], images?: File[] }
          const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] };
          files = [];
          if (filesObj.image) files.push(...filesObj.image);
          if (filesObj.images) files.push(...filesObj.images);
        }
      }
      
      const bodyData = req.body;

      const location = await prisma.location.findFirst({
        where: { id: locationId, business: { ownerId: userId } },
        select: { id: true, slug: true },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // If files are uploaded, process them and get S3 URLs
      let imageUrls: string[] | undefined;
      if (files && files.length > 0) {
        if (files.length > 4) {
          res.status(400).json({ error: 'Maximum 4 images allowed' });
          return;
        }

        // Validate all image files
        for (const file of files) {
          await validateImageFile(file);
        }

        // Process and upload all images
        const uploadPromises = files.map(async (file, index) => {
          let processedBuffer = file.buffer;
          try {
            processedBuffer = await processImage(file.buffer, {
              maxWidth: 1920,
              maxHeight: 1920,
              quality: 85,
            });
          } catch (error) {
            logger.warn(`Menu item image ${index} processing failed, using original:`, error);
          }

          const processedFile = {
            ...file,
            buffer: processedBuffer,
            size: processedBuffer.length,
          };

          const tempId = 'temp-' + Date.now();
          return uploadToS3({
            file: processedFile,
            entityType: 'menu-item',
            entityId: tempId,
            userId,
            filename: `image-${index}`,
            locationId,
          });
        });

        const results = await Promise.all(uploadPromises);
        imageUrls = results.map((r) => r.url);
      }

      // Handle existing images from FormData (string URLs sent as JSON)
      let existingImages: string[] | undefined;
      if (bodyData.existingImages) {
        try {
          existingImages = typeof bodyData.existingImages === 'string' 
            ? JSON.parse(bodyData.existingImages) 
            : bodyData.existingImages;
        } catch {
          existingImages = undefined;
        }
      }

      // Combine uploaded image URLs with existing image URLs
      // Priority: newly uploaded files, then existing URLs
      let finalImageUrls: string[] | undefined;
      if (imageUrls && imageUrls.length > 0) {
        finalImageUrls = imageUrls;
        // If we have existing images, append them (but limit to 3 total)
        if (existingImages) {
          finalImageUrls = [...imageUrls, ...existingImages].slice(0, 3);
        }
      } else if (existingImages) {
        finalImageUrls = existingImages.slice(0, 3);
      }

      const rawData = menuItemSchema.parse({
        categoryId: bodyData.categoryId,
        name: bodyData.name,
        description: bodyData.description,
        price: typeof bodyData.price === 'string' ? parseFloat(bodyData.price) : bodyData.price,
        image: finalImageUrls ? finalImageUrls[0] : bodyData.image || '',
        images: finalImageUrls,
        video: bodyData.video || undefined,
        ingredients: bodyData.ingredients ? (typeof bodyData.ingredients === 'string' ? JSON.parse(bodyData.ingredients) : bodyData.ingredients) : [],
        allergens: bodyData.allergens ? (typeof bodyData.allergens === 'string' ? JSON.parse(bodyData.allergens) : bodyData.allergens) : [],
        tags: bodyData.tags ? (typeof bodyData.tags === 'string' ? JSON.parse(bodyData.tags) : bodyData.tags) : [],
        nutritionalInfo: bodyData.nutritionalInfo ? (typeof bodyData.nutritionalInfo === 'string' ? JSON.parse(bodyData.nutritionalInfo) : bodyData.nutritionalInfo) : undefined,
        isVegetarian: bodyData.isVegetarian === 'true' || bodyData.isVegetarian === true || false,
        isVegan: bodyData.isVegan === 'true' || bodyData.isVegan === true || false,
        isGlutenFree: bodyData.isGlutenFree === 'true' || bodyData.isGlutenFree === true || false,
        spicyLevel: bodyData.spicyLevel ? parseInt(bodyData.spicyLevel) : undefined,
        availability: bodyData.availability || 'IN_STOCK',
        preparationTime: bodyData.preparationTime || undefined,
      });

      // Normalize image data
      const { image, images } = this.normalizeImageData(rawData);
      const data = {
        ...rawData,
        image,
        images,
      };

      const maxOrder = await prisma.menuItem.findFirst({
        where: { locationId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });

      const menuItem = await prisma.menuItem.create({
        data: {
          ...data,
          locationId,
          sortOrder: (maxOrder?.sortOrder || 0) + 1,
        },
        include: { category: true },
      });

      // Update upload records with correct entityId if files were uploaded
      if (files && imageUrls && imageUrls.length > 0) {
        for (const url of imageUrls) {
          const uploads = await prisma.upload.findMany({
            where: {
              s3Url: url,
              entityId: { startsWith: 'temp-' },
            },
            take: 1,
          });
          if (uploads.length > 0) {
            await prisma.upload.update({
              where: { id: uploads[0].id },
              data: { entityId: menuItem.id },
            });
          }
        }
      }

      // Clear menu cache for this location
      await clearMenuCache(locationId, location.slug);

      res.status(201).json({ message: 'Menu item created', menuItem });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      if (error instanceof Error && error.message === 'At least one image is required') {
        res.status(400).json({ error: error.message });
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

  // PUT /api/v1/menu-items/:id
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      
      // Handle both uploadFields (object) and uploadMultiple (array) formats
      let files: Express.Multer.File[] | undefined;
      if (req.files) {
        if (Array.isArray(req.files)) {
          files = req.files;
        } else {
          // uploadFields format: { image?: File[], images?: File[] }
          const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] };
          files = [];
          if (filesObj.image) files.push(...filesObj.image);
          if (filesObj.images) files.push(...filesObj.images);
        }
      }
      
      const bodyData = req.body;

      const existing = await prisma.menuItem.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Menu item not found' });
        return;
      }

      // Parse image order to understand which files go to which positions
      let imageOrder: (string | { type: 'file'; fileIndex: number })[] | undefined;
      if (bodyData.imageOrder) {
        try {
          imageOrder = typeof bodyData.imageOrder === 'string' 
            ? JSON.parse(bodyData.imageOrder) 
            : bodyData.imageOrder;
        } catch {
          imageOrder = undefined;
        }
      }

      // If files are uploaded, process them and get S3 URLs
      let uploadedImageUrls: string[] = [];
      const imagesToDelete: string[] = [];
      const currentImages = [existing.image, ...(existing.images || [])].filter(
        (img): img is string => img !== null && img !== undefined
      );
      
      if (files && files.length > 0) {
        if (files.length > 4) {
          res.status(400).json({ error: 'Maximum 4 images allowed' });
          return;
        }

        // Validate all image files
        for (const file of files) {
          await validateImageFile(file);
        }

        // Process and upload all images
        const uploadPromises = files.map(async (file, fileIndex) => {
          let processedBuffer = file.buffer;
          try {
            processedBuffer = await processImage(file.buffer, {
              maxWidth: 1920,
              maxHeight: 1920,
              quality: 85,
            });
          } catch (error) {
            logger.warn(`Menu item image ${fileIndex} processing failed, using original:`, error);
          }

          const processedFile = {
            ...file,
            buffer: processedBuffer,
            size: processedBuffer.length,
          };

          // Get locationId from existing menu item
          const menuItemLocation = existing.locationId;
          
          return uploadToS3({
            file: processedFile,
            entityType: 'menu-item',
            entityId: id,
            userId,
            filename: `image-${fileIndex}`,
            locationId: menuItemLocation,
          });
        });

        const results = await Promise.all(uploadPromises);
        uploadedImageUrls = results.map((r) => r.url);
      }

      // Reconstruct the final images array preserving order
      let finalImageUrls: string[] | undefined;
      
      if (imageOrder && imageOrder.length > 0) {
        // Map uploaded files to their positions using imageOrder
        finalImageUrls = imageOrder.map((item, arrayIndex) => {
          if (typeof item === 'string') {
            // Existing URL - keep it
            return item;
          } else if (item.type === 'file' && uploadedImageUrls[item.fileIndex] !== undefined) {
            // This position has a new file - use uploaded URL
            // Mark the old image at this position for deletion
            if (currentImages[arrayIndex]) {
              imagesToDelete.push(currentImages[arrayIndex]);
            }
            return uploadedImageUrls[item.fileIndex];
          }
          // Fallback: if item is invalid, try to use existing image at this position
          return currentImages[arrayIndex] || '';
        }).filter((url): url is string => url !== '' && url !== null && url !== undefined);
      } else if (uploadedImageUrls.length > 0) {
        // No imageOrder provided - use uploaded files only (replace all)
        finalImageUrls = uploadedImageUrls;
        imagesToDelete.push(...currentImages);
      } else {
        // Handle existingImages as fallback (backward compatibility)
        let existingImages: string[] | undefined;
        if (bodyData.existingImages) {
          try {
            existingImages = typeof bodyData.existingImages === 'string' 
              ? JSON.parse(bodyData.existingImages) 
              : bodyData.existingImages;
          } catch {
            existingImages = undefined;
          }
        }
        if (existingImages) {
          finalImageUrls = existingImages.slice(0, 4);
        }
      }

      // Delete only the images that were replaced
      if (imagesToDelete.length > 0) {
        const s3Keys = imagesToDelete
          .map((url) => extractS3KeyFromUrl(url))
          .filter((key): key is string => key !== null);

        if (s3Keys.length > 0) {
          await deleteMultipleFromS3(s3Keys);
        }
      }

      const rawData = menuItemSchema.partial().parse({
        categoryId: bodyData.categoryId || undefined,
        name: bodyData.name || undefined,
        description: bodyData.description || undefined,
        price: bodyData.price ? (typeof bodyData.price === 'string' ? parseFloat(bodyData.price) : bodyData.price) : undefined,
        image: finalImageUrls ? finalImageUrls[0] : bodyData.image || undefined,
        images: finalImageUrls,
        video: bodyData.video || undefined,
        ingredients: bodyData.ingredients ? (typeof bodyData.ingredients === 'string' ? JSON.parse(bodyData.ingredients) : bodyData.ingredients) : undefined,
        allergens: bodyData.allergens ? (typeof bodyData.allergens === 'string' ? JSON.parse(bodyData.allergens) : bodyData.allergens) : undefined,
        tags: bodyData.tags ? (typeof bodyData.tags === 'string' ? JSON.parse(bodyData.tags) : bodyData.tags) : undefined,
        nutritionalInfo: bodyData.nutritionalInfo ? (typeof bodyData.nutritionalInfo === 'string' ? JSON.parse(bodyData.nutritionalInfo) : bodyData.nutritionalInfo) : undefined,
        isVegetarian: bodyData.isVegetarian !== undefined ? (bodyData.isVegetarian === 'true' || bodyData.isVegetarian === true) : undefined,
        isVegan: bodyData.isVegan !== undefined ? (bodyData.isVegan === 'true' || bodyData.isVegan === true) : undefined,
        isGlutenFree: bodyData.isGlutenFree !== undefined ? (bodyData.isGlutenFree === 'true' || bodyData.isGlutenFree === true) : undefined,
        spicyLevel: bodyData.spicyLevel ? parseInt(bodyData.spicyLevel) : undefined,
        availability: bodyData.availability || undefined,
        preparationTime: bodyData.preparationTime || undefined,
      });

      // If image-related fields are being updated, normalize them
      let data = { ...rawData };
      if (rawData.image !== undefined || rawData.images !== undefined) {
        // Merge with existing data to normalize properly
        const mergedData = {
          image: rawData.image ?? existing.image,
          images: rawData.images ?? existing.images,
        };
        const normalized = this.normalizeImageData(mergedData);
        
        // Delete old images from S3 that are no longer in the new set (only if not uploading new files)
        // Note: Image deletions for replaced files are already handled above
        if (!uploadedImageUrls || uploadedImageUrls.length === 0) {
          const oldImages = [existing.image, ...(existing.images || [])].filter(
            (img): img is string => img !== null && img !== undefined
          );
          const newImages = normalized.images;
          const imagesToDelete = oldImages.filter((oldImg) => !newImages.includes(oldImg));
          
          if (imagesToDelete.length > 0) {
            const s3Keys = imagesToDelete
              .map((url) => extractS3KeyFromUrl(url))
              .filter((key): key is string => key !== null);
            
            if (s3Keys.length > 0) {
              await deleteMultipleFromS3(s3Keys);
            }
          }
        }
        
        data = {
          ...data,
          image: normalized.image,
          images: normalized.images,
        };
      }

      const menuItem = await prisma.menuItem.update({
        where: { id },
        data,
        include: { category: true },
      });

      // Clear menu cache for this location
      const location = await prisma.location.findUnique({
        where: { id: existing.locationId },
        select: { slug: true },
      });
      await clearMenuCache(existing.locationId, location?.slug);

      res.json({ message: 'Menu item updated', menuItem });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      if (error instanceof Error && error.message === 'At least one image is required') {
        res.status(400).json({ error: error.message });
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

  // DELETE /api/v1/menu-items/:id
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const existing = await prisma.menuItem.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Menu item not found' });
        return;
      }

      // Delete all images from S3
      const allImages = [existing.image, ...(existing.images || [])].filter(
        (img): img is string => img !== null && img !== undefined
      );
      
      if (allImages.length > 0) {
        const s3Keys = allImages
          .map((url) => extractS3KeyFromUrl(url))
          .filter((key): key is string => key !== null);
        
        if (s3Keys.length > 0) {
          await deleteMultipleFromS3(s3Keys);
        }
      }

      // Get location info before deletion
      const locationId = existing.locationId;
      const location = await prisma.location.findUnique({
        where: { id: locationId },
        select: { slug: true },
      });

      await prisma.menuItem.delete({ where: { id } });

      // Clear menu cache for this location
      await clearMenuCache(locationId, location?.slug);

      res.json({ message: 'Menu item deleted' });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/menu-items/:id/availability
  async updateAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { availability } = z
        .object({
          availability: z.enum(['IN_STOCK', 'OUT_OF_STOCK', 'HIDDEN']),
        })
        .parse(req.body);

      const existing = await prisma.menuItem.findFirst({
        where: { id, location: { business: { ownerId: userId } } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Menu item not found' });
        return;
      }

      const menuItem = await prisma.menuItem.update({
        where: { id },
        data: { availability },
      });

      // Clear menu cache for this location
      const location = await prisma.location.findUnique({
        where: { id: existing.locationId },
        select: { slug: true },
      });
      await clearMenuCache(existing.locationId, location?.slug);

      res.json({ message: 'Availability updated', menuItem });
    } catch (error) {
      next(error);
    }
  }

}

export default new MenuItemController();

