import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';

/**
 * Middleware to require email verification
 * Use this after authenticate middleware
 */
export const requireEmailVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userId = req.user.userId;

    // Get user to check email verification status
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        error: 'Email verification required',
        message: 'Please verify your email address to access this feature',
        emailVerified: false,
      });
      return;
    }

    next();
  } catch (error) {
    console.error('[Email Verification Middleware Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

