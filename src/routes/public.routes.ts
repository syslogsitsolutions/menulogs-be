import { Router } from 'express';
import publicController from '../controllers/public.controller';
import { publicApiLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

// Apply rate limiting to all public routes
router.use(publicApiLimiter);

// Public routes (no authentication required)

// Slug-based routes (NEW - Primary)
router.get('/locations/by-slug/:slug/menu', publicController.getLocationMenuBySlug.bind(publicController));
router.get(
  '/locations/by-slug/:slug/categories/:categoryId',
  publicController.getCategoryItemsBySlug.bind(publicController)
);
router.get('/locations/by-slug/:slug/about', publicController.getAboutPage.bind(publicController));
router.get('/locations/by-slug/:slug/contact', publicController.getContactPage.bind(publicController));

// UUID-based routes (Backward compatibility)
router.get('/locations/:locationId/menu', publicController.getLocationMenu.bind(publicController));
router.get(
  '/locations/:locationId/categories/:categoryId',
  publicController.getCategoryItems.bind(publicController)
);

// Item and search routes
router.get('/menu-items/:id', publicController.getMenuItem.bind(publicController));
router.get('/search', publicController.search.bind(publicController));

export default router;

