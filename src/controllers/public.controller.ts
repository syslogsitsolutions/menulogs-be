import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import redis from '../config/redis';

const CACHE_TTL = 3600; // 1 hour

export class PublicController {
  // GET /api/v1/public/locations/by-slug/:slug/menu
  async getLocationMenuBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;

      // Check cache
      const cacheKey = `menu:slug:${slug}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      // Fetch location by slug
      const location = await prisma.location.findUnique({
        where: { slug, isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          address: true,
          city: true,
          state: true,
          phone: true,
          email: true,
          openingHours: true,
          brandColor: true,
          business: {
            select: {
              name: true,
              logo: true,
              description: true,
              brandDescription: true,
              facebookUrl: true,
              instagramUrl: true,
              twitterUrl: true,
              linkedinUrl: true,
              youtubeUrl: true,
            },
          },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Fetch categories with items
      const categories = await prisma.category.findMany({
        where: {
          locationId: location.id,
          isVisible: true,
        },
        include: {
          menuItems: {
            where: {
              availability: 'IN_STOCK',
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      // Fetch banners
      const banners = await prisma.banner.findMany({
        where: {
          locationId: location.id,
          isActive: true,
        },
        orderBy: { sortOrder: 'asc' },
        take: 10,
      });

      // Fetch featured sections
      const featuredSections = await prisma.featuredSection.findMany({
        where: {
          locationId: location.id,
          isActive: true,
        },
        orderBy: { sortOrder: 'asc' },
      });

      const response = {
        location,
        categories,
        banners,
        featuredSections,
      };

      // Cache for 5 minutes
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(response));

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/public/locations/:locationId/menu
  async getLocationMenu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;

      // Check cache
      const cacheKey = `menu:${locationId}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      // Fetch location
      const location = await prisma.location.findUnique({
        where: { id: locationId, isActive: true },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          phone: true,
          email: true,
          openingHours: true,
          brandColor: true,
          business: {
            select: {
              name: true,
              logo: true,
              description: true,
              brandDescription: true,
              facebookUrl: true,
              instagramUrl: true,
              twitterUrl: true,
              linkedinUrl: true,
              youtubeUrl: true,
            },
          },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Fetch categories with items
      const categories = await prisma.category.findMany({
        where: {
          locationId,
          isVisible: true,
        },
        include: {
          menuItems: {
            where: {
              availability: 'IN_STOCK',
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      // Fetch banners
      const banners = await prisma.banner.findMany({
        where: {
          locationId,
          isActive: true,
        },
        orderBy: { sortOrder: 'asc' },
        take: 10,
      });

      const response = {
        location,
        categories,
        banners,
      };

      // Cache for 5 minutes
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(response));

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/public/menu-items/:id
  async getMenuItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const sessionId = req.headers['x-session-id'] as string;
      const ipAddress = req.ip;
      const userAgent = req.headers['user-agent'];

      const menuItem = await prisma.menuItem.findUnique({
        where: { id, availability: 'IN_STOCK' },
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              business: {
                select: {
                  name: true,
                  logo: true,
                },
              },
            },
          },
        },
      });

      if (!menuItem) {
        res.status(404).json({ error: 'Menu item not found' });
        return;
      }

      // Track view
      await prisma.menuItemView.create({
        data: {
          menuItemId: id,
          sessionId,
          ipAddress,
          userAgent,
        },
      }).catch(() => {
        // Ignore errors for analytics
      });

      res.json({ menuItem });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/public/search
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, locationId } = req.query;

      if (!q || !locationId) {
        res.status(400).json({ error: 'Query and locationId required' });
        return;
      }

      const searchTerm = q as string;

      const menuItems = await prisma.menuItem.findMany({
        where: {
          locationId: locationId as string,
          availability: 'IN_STOCK',
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
            { tags: { hasSome: [searchTerm] } },
          ],
        },
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
        take: 20,
      });

      res.json({ results: menuItems, count: menuItems.length });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/public/locations/:locationId/categories/:categoryId
  async getCategoryItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId, categoryId } = req.params;

      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          locationId,
          isVisible: true,
        },
        include: {
          menuItems: {
            where: { availability: 'IN_STOCK' },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!category) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      res.json({ category });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/public/locations/by-slug/:slug/categories/:categoryId
  async getCategoryItemsBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug, categoryId } = req.params;

      // First, get location by slug
      const location = await prisma.location.findUnique({
        where: { slug, isActive: true },
        select: { id: true, name: true, slug: true },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Then get category
      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          locationId: location.id,
          isVisible: true,
        },
        include: {
          menuItems: {
            where: { availability: 'IN_STOCK' },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!category) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      res.json({ 
        location,
        category,
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/public/locations/by-slug/:slug/about
  async getAboutPage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;

      // Check cache
      const cacheKey = `about:slug:${slug}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      // Fetch location by slug
      const location = await prisma.location.findUnique({
        where: { slug, isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          business: {
            select: {
              id: true,
              name: true,
              logo: true,
              description: true,
              aboutContent: true,
              aboutImage: true,
            },
          },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const response = {
        location: {
          id: location.id,
          name: location.name,
          slug: location.slug,
        },
        business: location.business,
      };

      // Cache for 1 hour
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(response));

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/public/locations/by-slug/:slug/contact
  async getContactPage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;

      // Check cache
      const cacheKey = `contact:slug:${slug}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      // Fetch location by slug
      const location = await prisma.location.findUnique({
        where: { slug, isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          country: true,
          phone: true,
          email: true,
          openingHours: true,
          contactContent: true,
          contactImage: true,
          mapEmbedUrl: true,
          business: {
            select: {
              name: true,
              logo: true,
            },
          },
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const response = {
        location,
      };

      // Cache for 1 hour
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(response));

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
}

export default new PublicController();

