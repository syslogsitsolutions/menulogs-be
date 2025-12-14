import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

// Public routes (with rate limiting)
router.post('/signup', authLimiter, authController.signup.bind(authController));
router.post('/login', authLimiter, authController.login.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.post('/logout', authController.logout.bind(authController));
router.post('/forgot-password', authLimiter, authController.forgotPassword.bind(authController));
router.post('/reset-password', authLimiter, authController.resetPassword.bind(authController));

// Protected routes
router.get('/me', authenticate, authController.me.bind(authController));
router.post('/change-password', authenticate, authController.changePassword.bind(authController));

export default router;

