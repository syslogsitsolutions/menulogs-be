import { Request, Response, NextFunction } from 'express';
import authService from '../services/auth.service';
import { z } from 'zod';

// Validation schemas
const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export class AuthController {
  // POST /api/v1/auth/signup
  async signup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, email, password } = signupSchema.parse(req.body);

      const result = await authService.signup(name, email, password);

      // Set refresh token in httpOnly cookie
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax', // Use 'lax' for development
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/', // Ensure cookie is available for all paths
      });

      res.status(201).json({
        message: 'Account created successfully',
        user: result.user,
        accessToken: result.accessToken,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // POST /api/v1/auth/login
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;

      const result = await authService.login(email, password, userAgent, ipAddress);

      // Set refresh token in httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        message: 'Login successful',
        user: result.user,
        business: result.business,
        locations: result.locations,
        accessToken: result.accessToken,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      if (error instanceof Error && error.message === 'Invalid credentials') {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
      next(error);
    }
  }

  // POST /api/v1/auth/refresh
  async refresh(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      // Try to get refresh token from cookie first, then body
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

      // Log for debugging (remove in production)
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Refresh Token Request]', {
          hasCookie: !!req.cookies?.refreshToken,
          hasBody: !!req.body?.refreshToken,
          cookies: Object.keys(req.cookies || {}),
        });
      }

      if (!refreshToken) {
        res.status(401).json({ error: 'Refresh token required' });
        return;
      }

      const result = await authService.refreshAccessToken(refreshToken);

      // Set new refresh token cookie
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax', // Use 'lax' for development to allow cross-origin
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/', // Ensure cookie is available for all paths
      });

      res.json({
        accessToken: result.accessToken,
      });
    } catch (error) {
      console.error('[Refresh Token Controller Error]', error);
      // Clear invalid refresh token cookie
      res.clearCookie('refreshToken');
      res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }

  // POST /api/v1/auth/logout
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.refreshToken;

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      // Clear refresh token cookie with same options used to set it
      const isProduction = process.env.NODE_ENV === 'production';
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        path: '/',
      });

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/auth/me
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const result = await authService.getCurrentUser(req.user.userId);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/auth/forgot-password
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);

      const result = await authService.forgotPassword(email);

      res.json({
        message: result.message,
        // Only include token in development
        ...(process.env.NODE_ENV !== 'production' && result.token && { token: result.token }),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      next(error);
    }
  }

  // POST /api/v1/auth/reset-password
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = resetPasswordSchema.parse(req.body);

      await authService.resetPassword(token, password);

      res.json({
        message: 'Password has been reset successfully. Please login with your new password.',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      if (error instanceof Error) {
        if (error.message.includes('Invalid') || error.message.includes('expired') || error.message.includes('used')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      next(error);
    }
  }

  // POST /api/v1/auth/change-password
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

      await authService.changePassword(userId, currentPassword, newPassword);

      res.json({
        message: 'Password has been changed successfully. Please login again.',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', errors: error.errors });
        return;
      }
      if (error instanceof Error) {
        if (error.message.includes('Current password') || error.message.includes('not found')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      next(error);
    }
  }

  // POST /api/v1/auth/send-verification-email
  async sendVerificationEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      
      // Get user to get email and name
      const currentUserData = await authService.getCurrentUser(userId);
      
      if (currentUserData.user.emailVerified) {
        res.json({
          message: 'Email is already verified',
        });
        return;
      }

      await authService.sendVerificationEmail(
        userId,
        currentUserData.user.email,
        currentUserData.user.name
      );

      res.json({
        message: 'Verification email sent successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/auth/verify-email
  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body;
      
      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Verification token is required' });
        return;
      }

      await authService.verifyEmail(token);

      res.json({
        message: 'Email verified successfully',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes('Invalid') ||
          error.message.includes('expired') ||
          error.message.includes('used')
        ) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      next(error);
    }
  }
}

export default new AuthController();

