/**
 * Subscription Middleware
 * 
 * Middleware for checking subscription status, plan limits, and feature access.
 * Provides reusable middleware functions for route protection.
 * 
 * @module middleware/subscription
 */

import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import usageTrackingService from '../services/usageTracking.service';
import featureAccessService from '../services/featureAccess.service';
import { SubscriptionStatus } from '@prisma/client';
import { logger } from '../utils/logger.util';

/**
 * Extend Express Request to include subscription info
 */
declare global {
  namespace Express {
    interface Request {
      subscription?: {
        id: string;
        plan: string;
        status: SubscriptionStatus;
        locationId: string;
      };
      location?: {
        id: string;
        subscriptionPlan: string;
        subscriptionStatus: SubscriptionStatus;
      };
    }
  }
}

/**
 * Require active subscription (ACTIVE or TRIAL status)
 * Attaches subscription and location info to request
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get locationId from params or body
    const locationId = req.params.locationId || req.body.locationId;
    if (!locationId) {
      res.status(400).json({ error: 'Location ID is required' });
      return;
    }

    // Get location with subscription
    const location = await prisma.location.findFirst({
      where: {
        id: locationId,
        business: { ownerId: userId },
      },
      include: {
        subscription: true,
      },
    });

    if (!location) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }

    // Check subscription status
    const status = location.subscriptionStatus;
    const plan = location.subscriptionPlan || 'FREE';

    // Allow FREE plan (trial) and active subscriptions
    if (status === 'CANCELLED' || status === 'EXPIRED') {
      // Check if in grace period
      if (location.subscription?.gracePeriodStatus === 'ACTIVE' && location.subscription.gracePeriodEndsAt) {
        const now = new Date();
        if (location.subscription.gracePeriodEndsAt > now) {
          // Still in grace period, allow access
          req.location = location;
          req.subscription = location.subscription
            ? {
                id: location.subscription.id,
                plan: plan,
                status: status,
                locationId: location.id,
              }
            : undefined;
          next();
          return;
        }
      }

      res.status(403).json({
        error: 'Subscription required',
        message: 'Your subscription has expired. Please renew to continue using this feature.',
        subscriptionStatus: status,
        plan: plan,
        upgradeUrl: `${process.env.FRONTEND_URL}/subscription/upgrade?locationId=${locationId}`,
      });
      return;
    }

    // Check trial expiry for FREE plan
    if (plan === 'FREE' && location.trialEndsAt) {
      const now = new Date();
      if (location.trialEndsAt < now) {
        res.status(403).json({
          error: 'Trial expired',
          message: 'Your free trial has expired. Please upgrade to continue using this feature.',
          trialEndedAt: location.trialEndsAt,
          upgradeUrl: `${process.env.FRONTEND_URL}/subscription/upgrade?locationId=${locationId}`,
        });
        return;
      }
    }

    // Attach subscription and location to request
    req.location = location;
    req.subscription = location.subscription
      ? {
          id: location.subscription.id,
          plan: plan,
          status: status,
          locationId: location.id,
        }
      : undefined;

    next();
  } catch (error) {
    logger.error('Subscription middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Check plan limit for a specific resource
 * Factory function that returns middleware
 */
export const checkPlanLimit = (
  resource: 'menuItems' | 'categories' | 'banners' | 'featuredSections'
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locationId = req.params.locationId || req.body.locationId || req.location?.id;
      if (!locationId) {
        res.status(400).json({ error: 'Location ID is required' });
        return;
      }

      // Check usage limit (without tracking - tracking happens in controller after successful creation)
      let usageCheck;
      switch (resource) {
        case 'menuItems':
          usageCheck = await usageTrackingService.checkMenuItemCreation(locationId);
          break;
        case 'categories':
          usageCheck = await usageTrackingService.checkCategoryCreation(locationId);
          break;
        case 'banners':
          usageCheck = await usageTrackingService.checkBannerCreation(locationId);
          break;
        case 'featuredSections':
          usageCheck = await usageTrackingService.checkFeaturedSectionCreation(locationId);
          break;
        default:
          res.status(400).json({ error: 'Invalid resource type' });
          return;
      }

      if (!usageCheck.allowed) {
        res.status(403).json({
          error: 'Plan limit reached',
          message: usageCheck.reason,
          resource,
          currentUsage: usageCheck.currentUsage,
          limit: usageCheck.limit,
          upgradePlan: usageCheck.upgradePlan,
          upgradeUrl: `${process.env.FRONTEND_URL}/subscription/upgrade?locationId=${locationId}&plan=${usageCheck.upgradePlan || ''}`,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Plan limit check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Check storage limit before upload
 */
export const checkStorageLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const locationId = req.params.locationId || req.body.locationId || req.location?.id;
    if (!locationId) {
      res.status(400).json({ error: 'Location ID is required' });
      return;
    }

    // Calculate total file size
    let totalBytes = 0;
    if (req.files) {
      if (Array.isArray(req.files)) {
        totalBytes = req.files.reduce((sum, file) => sum + file.size, 0);
      } else {
        // uploadFields format
        const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] };
        Object.values(filesObj).forEach((files) => {
          totalBytes += files.reduce((sum, file) => sum + file.size, 0);
        });
      }
    } else if (req.file) {
      totalBytes = req.file.size;
    }

    if (totalBytes === 0) {
      // No files to check
      next();
      return;
    }

    // Check storage limit (without tracking - tracking happens in controller after successful upload)
    const usageCheck = await usageTrackingService.checkStorageUsage(locationId, totalBytes);
    if (!usageCheck.allowed) {
      res.status(403).json({
        error: 'Storage limit reached',
        message: usageCheck.reason,
        currentUsage: usageCheck.currentUsage,
        limit: usageCheck.limit,
        upgradePlan: usageCheck.upgradePlan,
        upgradeUrl: `${process.env.FRONTEND_URL}/subscription/upgrade?locationId=${locationId}&plan=${usageCheck.upgradePlan || ''}`,
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Storage limit check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Check monthly upload limit
 */
export const checkMonthlyUploadLimit = (uploadType: 'image' | 'video') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locationId = req.params.locationId || req.body.locationId || req.location?.id;
      if (!locationId) {
        res.status(400).json({ error: 'Location ID is required' });
        return;
      }

      // Count files being uploaded
      let fileCount = 0;
      if (req.files) {
        if (Array.isArray(req.files)) {
          fileCount = req.files.length;
        } else {
          const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] };
          Object.values(filesObj).forEach((files) => {
            fileCount += files.length;
          });
        }
      } else if (req.file) {
        fileCount = 1;
      }

      if (fileCount === 0) {
        next();
        return;
      }

      // Check monthly upload limit for each file (without tracking - tracking happens in controller after successful upload)
      for (let i = 0; i < fileCount; i++) {
        const usageCheck =
          uploadType === 'image'
            ? await usageTrackingService.checkImageUpload(locationId)
            : await usageTrackingService.checkVideoUpload(locationId);

        if (!usageCheck.allowed) {
          res.status(403).json({
            error: 'Monthly upload limit reached',
            message: usageCheck.reason,
            uploadType,
            currentUsage: usageCheck.currentUsage,
            limit: usageCheck.limit,
            upgradePlan: usageCheck.upgradePlan,
            upgradeUrl: `${process.env.FRONTEND_URL}/subscription/upgrade?locationId=${locationId}&plan=${usageCheck.upgradePlan || ''}`,
          });
          return;
        }
      }

      next();
    } catch (error) {
      logger.error('Monthly upload limit check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Require specific feature
 * Factory function that returns middleware
 */
export const requireFeature = (feature: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locationId = req.params.locationId || req.body.locationId || req.location?.id;
      if (!locationId) {
        res.status(400).json({ error: 'Location ID is required' });
        return;
      }

      // Get location plan
      const location = await prisma.location.findUnique({
        where: { id: locationId },
        select: { subscriptionPlan: true },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const plan = (location.subscriptionPlan || 'FREE') as any;

      // Check if feature is available
      const hasFeature = featureAccessService.hasFeature(plan, feature as any);
      if (!hasFeature) {
        const recommendation = featureAccessService.getUpgradeRecommendation(plan, feature as any);
        res.status(403).json({
          error: 'Feature not available',
          message: `This feature is not available in your current plan (${plan}).`,
          feature,
          currentPlan: plan,
          upgradePlan: recommendation,
          upgradeUrl: `${process.env.FRONTEND_URL}/subscription/upgrade?locationId=${locationId}&plan=${recommendation || ''}`,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Feature check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

