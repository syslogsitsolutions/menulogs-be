import { Router } from 'express';
import authRoutes from './auth.routes';
import businessRoutes from './business.routes';
import locationRoutes from './location.routes';
import categoryRoutes from './category.routes';
import menuItemRoutes from './menuItem.routes';
import bannerRoutes from './banner.routes';
import featuredSectionRoutes from './featuredSection.routes';
import publicRoutes from './public.routes';
import subscriptionRoutes from './subscription.routes';
import paymentRoutes from './payment.routes';
import paymentMethodRoutes from './paymentMethod.routes';
import qrcodeRoutes from './qrcode.routes';
import uploadRoutes from './upload.routes';
import tableRoutes from './table.routes';
import orderRoutes from './order.routes';
import staffRoutes from './staff.routes';
import metricsRoutes from './metrics.routes';

const router = Router();

// Public routes (no auth required)
router.use('/public', publicRoutes);

// Protected routes
router.use('/auth', authRoutes);
router.use('/businesses', businessRoutes);
router.use('/locations', locationRoutes);
router.use('/categories', categoryRoutes);
router.use('/menu-items', menuItemRoutes);
router.use('/banners', bannerRoutes);
router.use('/featured-sections', featuredSectionRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/payments', paymentRoutes);
router.use('/payment-methods', paymentMethodRoutes);
router.use('/qrcode', qrcodeRoutes);
router.use('/upload', uploadRoutes);

// Order Management routes
router.use('/', tableRoutes);
router.use('/', orderRoutes);
router.use('/', staffRoutes);

// Metrics & Monitoring
router.use('/metrics', metricsRoutes);

// API info
router.get('/', (_req, res) => {
  res.json({
    name: 'MenuLogs API',
    version: '1.0.0',
    description: 'Restaurant Menu Management API with Razorpay Integration',
    endpoints: {
      public: '/api/v1/public',
      auth: '/api/v1/auth',
      businesses: '/api/v1/businesses',
      locations: '/api/v1/locations',
      categories: '/api/v1/categories',
      menuItems: '/api/v1/menu-items',
      banners: '/api/v1/banners',
      featuredSections: '/api/v1/featured-sections',
      subscriptions: '/api/v1/subscriptions',
      payments: '/api/v1/payments',
      paymentMethods: '/api/v1/payment-methods',
      qrcode: '/api/v1/qrcode',
      upload: '/api/v1/upload',
      // Order Management
      tables: '/api/v1/locations/:locationId/tables',
      orders: '/api/v1/locations/:locationId/orders',
      staff: '/api/v1/locations/:locationId/staff',
      kitchenOrders: '/api/v1/locations/:locationId/kitchen-orders',
    },
  });
});

export default router;

