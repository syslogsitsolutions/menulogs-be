/**
 * Usage Tracking Service
 * 
 * Tracks resource usage against subscription plan limits.
 * Enforces limits and provides usage summaries.
 * 
 * @module services/usageTracking
 */

import prisma from '../config/database';
import { PRICING_PLANS } from './subscription.service';
import { logger } from '../utils/logger.util';
import {
  TrackResult,
  UsageSummary,
  PlanLimits,
  CurrentUsage,
  UsagePercentages,
  UsageWarning,
  GracePeriodInfo,
} from '../types/usage.types';
import { SubscriptionPlan } from '@prisma/client';

export class UsageTrackingService {
  /**
   * Check if menu item creation is allowed (without tracking)
   */
  async checkMenuItemCreation(locationId: string): Promise<TrackResult> {
    return this.checkResourceCreation(locationId, 'menuItems');
  }

  /**
   * Track menu item creation (increments counter)
   */
  async trackMenuItemCreation(locationId: string): Promise<TrackResult> {
    return this.trackResourceCreation(locationId, 'menuItems');
  }

  /**
   * Track menu item deletion
   */
  async trackMenuItemDeletion(locationId: string): Promise<void> {
    await this.decrementUsage(locationId, 'currentMenuItems');
  }

  /**
   * Check if category creation is allowed (without tracking)
   */
  async checkCategoryCreation(locationId: string): Promise<TrackResult> {
    return this.checkResourceCreation(locationId, 'categories');
  }

  /**
   * Track category creation (increments counter)
   */
  async trackCategoryCreation(locationId: string): Promise<TrackResult> {
    return this.trackResourceCreation(locationId, 'categories');
  }

  /**
   * Track category deletion
   */
  async trackCategoryDeletion(locationId: string): Promise<void> {
    await this.decrementUsage(locationId, 'currentCategories');
  }

  /**
   * Check if banner creation is allowed (without tracking)
   */
  async checkBannerCreation(locationId: string): Promise<TrackResult> {
    return this.checkResourceCreation(locationId, 'banners');
  }

  /**
   * Track banner creation (increments counter)
   */
  async trackBannerCreation(locationId: string): Promise<TrackResult> {
    return this.trackResourceCreation(locationId, 'banners');
  }

  /**
   * Track banner deletion
   */
  async trackBannerDeletion(locationId: string): Promise<void> {
    await this.decrementUsage(locationId, 'currentBanners');
  }

  /**
   * Check if featured section creation is allowed (without tracking)
   */
  async checkFeaturedSectionCreation(locationId: string): Promise<TrackResult> {
    return this.checkResourceCreation(locationId, 'featuredSections');
  }

  /**
   * Track featured section creation (increments counter)
   */
  async trackFeaturedSectionCreation(locationId: string): Promise<TrackResult> {
    return this.trackResourceCreation(locationId, 'featuredSections');
  }

  /**
   * Track featured section deletion
   */
  async trackFeaturedSectionDeletion(locationId: string): Promise<void> {
    await this.decrementUsage(locationId, 'currentFeaturedSections');
  }

  /**
   * Check storage usage limit (without tracking)
   */
  async checkStorageUsage(locationId: string, bytes: number): Promise<TrackResult> {
    const location = await this.getLocationWithSubscription(locationId);
    if (!location) {
      return { allowed: false, reason: 'Location not found' };
    }

    const plan = (location.subscriptionPlan || 'FREE') as keyof typeof PRICING_PLANS;
    const limits = PRICING_PLANS[plan].limits;
    const currentStorage = BigInt(location.currentStorageBytes || 0);
    const newStorage = currentStorage + BigInt(bytes);
    const limitBytes = limits.imageStorageBytes === -1 ? -1 : BigInt(limits.imageStorageBytes);

    // Check limit (unlimited = -1)
    if (limitBytes !== BigInt(-1) && newStorage > limitBytes) {
      const upgradePlan = this.getUpgradePlan(plan, 'storage');
      return {
        allowed: false,
        reason: `Storage limit exceeded. Current: ${this.formatBytes(Number(currentStorage))}, Limit: ${this.formatBytes(Number(limitBytes))}`,
        currentUsage: Number(currentStorage),
        limit: Number(limitBytes),
        upgradePlan,
      };
    }

    return { allowed: true };
  }

  /**
   * Track storage usage (increments counter)
   */
  async trackStorageUsage(locationId: string, bytes: number): Promise<TrackResult> {
    const location = await this.getLocationWithSubscription(locationId);
    if (!location) {
      return { allowed: false, reason: 'Location not found' };
    }

    const plan = (location.subscriptionPlan || 'FREE') as keyof typeof PRICING_PLANS;
    const limits = PRICING_PLANS[plan].limits;
    const currentStorage = BigInt(location.currentStorageBytes || 0);
    const newStorage = currentStorage + BigInt(bytes);
    const limitBytes = limits.imageStorageBytes === -1 ? -1 : BigInt(limits.imageStorageBytes);

    // Check limit (unlimited = -1)
    if (limitBytes !== BigInt(-1) && newStorage > limitBytes) {
      const upgradePlan = this.getUpgradePlan(plan, 'storage');
      return {
        allowed: false,
        reason: `Storage limit exceeded. Current: ${this.formatBytes(Number(currentStorage))}, Limit: ${this.formatBytes(Number(limitBytes))}`,
        currentUsage: Number(currentStorage),
        limit: Number(limitBytes),
        upgradePlan,
      };
    }

    // Update storage
    await prisma.location.update({
      where: { id: locationId },
      data: {
        currentStorageBytes: newStorage,
        lastUsageUpdate: new Date(),
      },
    });

    return { allowed: true };
  }

  /**
   * Track storage deletion
   */
  async trackStorageDeletion(locationId: string, bytes: number): Promise<void> {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { currentStorageBytes: true },
    });

    if (location) {
      const currentStorage = BigInt(location.currentStorageBytes || 0);
      const newStorage = currentStorage - BigInt(bytes);
      
      await prisma.location.update({
        where: { id: locationId },
        data: {
          currentStorageBytes: newStorage < 0 ? BigInt(0) : newStorage,
          lastUsageUpdate: new Date(),
        },
      });
    }
  }

  /**
   * Check if image upload is allowed (without tracking)
   */
  async checkImageUpload(locationId: string): Promise<TrackResult> {
    return this.checkMonthlyUpload(locationId, 'monthlyImageUploads', 'monthlyImageUploads');
  }

  /**
   * Track image upload (increments counter)
   */
  async trackImageUpload(locationId: string): Promise<TrackResult> {
    return this.trackMonthlyUpload(locationId, 'monthlyImageUploads', 'monthlyImageUploads');
  }

  /**
   * Check if video upload is allowed (without tracking)
   */
  async checkVideoUpload(locationId: string): Promise<TrackResult> {
    return this.checkMonthlyUpload(locationId, 'monthlyVideoUploads', 'monthlyVideoUploads');
  }

  /**
   * Track video upload (increments counter)
   */
  async trackVideoUpload(locationId: string): Promise<TrackResult> {
    return this.trackMonthlyUpload(locationId, 'monthlyVideoUploads', 'monthlyVideoUploads');
  }

  /**
   * Get usage summary for a location
   */
  async getUsageSummary(locationId: string): Promise<UsageSummary> {
    const location = await this.getLocationWithSubscription(locationId);
    if (!location) {
      throw new Error('Location not found');
    }

    const plan = (location.subscriptionPlan || 'FREE') as keyof typeof PRICING_PLANS;
    const limits = PRICING_PLANS[plan].limits;
    const planLimits: PlanLimits = {
      menuItems: limits.menuItems,
      categories: limits.categories,
      banners: limits.banners,
      featuredSections: limits.featuredSections,
      imageStorageBytes: limits.imageStorageBytes,
      videoStorageBytes: limits.videoStorageBytes,
      monthlyImageUploads: limits.monthlyImageUploads,
      monthlyVideoUploads: limits.monthlyVideoUploads,
      teamMembers: limits.teamMembers,
    };

    const currentUsage: CurrentUsage = {
      menuItems: location.currentMenuItems || 0,
      categories: location.currentCategories || 0,
      banners: location.currentBanners || 0,
      featuredSections: location.currentFeaturedSections || 0,
      storageBytes: location.currentStorageBytes?.toString() || '0',
      monthlyImageUploads: location.monthlyImageUploads || 0,
      monthlyVideoUploads: location.monthlyVideoUploads || 0,
    };

    // Calculate percentages
    const percentages: UsagePercentages = {
      menuItems: this.calculatePercentage(currentUsage.menuItems, planLimits.menuItems),
      categories: this.calculatePercentage(currentUsage.categories, planLimits.categories),
      banners: this.calculatePercentage(currentUsage.banners, planLimits.banners),
      featuredSections: this.calculatePercentage(
        currentUsage.featuredSections,
        planLimits.featuredSections
      ),
      storage: this.calculatePercentage(
        Number(currentUsage.storageBytes),
        planLimits.imageStorageBytes
      ),
      monthlyImageUploads: this.calculatePercentage(
        currentUsage.monthlyImageUploads,
        planLimits.monthlyImageUploads
      ),
      monthlyVideoUploads: this.calculatePercentage(
        currentUsage.monthlyVideoUploads,
        planLimits.monthlyVideoUploads
      ),
    };

    // Check for warnings (80% threshold)
    const warnings = this.generateWarnings(planLimits, currentUsage, percentages, plan);

    // Check if upgrade recommended (any resource > 80%)
    const upgradeRecommended = warnings.length > 0;

    // Get grace period info
    const gracePeriod = await this.getGracePeriodInfo(locationId);

    return {
      plan: plan as SubscriptionPlan,
      limits: planLimits,
      current: currentUsage,
      percentages,
      upgradeRecommended,
      gracePeriod,
      warnings,
    };
  }

  /**
   * Check if upgrade is needed (any resource > 80%)
   */
  async checkUpgradeNeeded(locationId: string): Promise<boolean> {
    const summary = await this.getUsageSummary(locationId);
    return summary.upgradeRecommended;
  }

  /**
   * Reset monthly limits for a location
   */
  async resetMonthlyLimits(locationId: string): Promise<void> {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    nextMonth.setHours(0, 0, 0, 0);

    await prisma.location.update({
      where: { id: locationId },
      data: {
        monthlyImageUploads: 0,
        monthlyVideoUploads: 0,
        monthlyUploadResetDate: nextMonth,
      },
    });

    logger.info('Monthly limits reset for location', { locationId, nextResetDate: nextMonth });
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Check resource creation limit (without tracking/incrementing)
   */
  private async checkResourceCreation(
    locationId: string,
    resourceType: 'menuItems' | 'categories' | 'banners' | 'featuredSections'
  ): Promise<TrackResult> {
    const location = await this.getLocationWithSubscription(locationId);
    if (!location) {
      return { allowed: false, reason: 'Location not found' };
    }

    const plan = (location.subscriptionPlan || 'FREE') as keyof typeof PRICING_PLANS;
    const limits = PRICING_PLANS[plan].limits;
    const limit = limits[resourceType];

    // Get current usage
    const currentFieldMap = {
      menuItems: 'currentMenuItems',
      categories: 'currentCategories',
      banners: 'currentBanners',
      featuredSections: 'currentFeaturedSections',
    } as const;

    const currentField = currentFieldMap[resourceType];
    const currentUsage = (location as any)[currentField] || 0;

    // Check limit (unlimited = -1)
    if (limit !== -1 && currentUsage >= limit) {
      const upgradePlan = this.getUpgradePlan(plan, resourceType);
      return {
        allowed: false,
        reason: `${this.formatResourceName(resourceType)} limit reached (${currentUsage}/${limit})`,
        currentUsage,
        limit,
        upgradePlan,
      };
    }

    return { allowed: true };
  }

  /**
   * Track resource creation (menu items, categories, banners, featured sections)
   * This increments the counter - use checkResourceCreation for validation only
   */
  private async trackResourceCreation(
    locationId: string,
    resourceType: 'menuItems' | 'categories' | 'banners' | 'featuredSections'
  ): Promise<TrackResult> {
    const location = await this.getLocationWithSubscription(locationId);
    if (!location) {
      return { allowed: false, reason: 'Location not found' };
    }

    const plan = (location.subscriptionPlan || 'FREE') as keyof typeof PRICING_PLANS;
    const limits = PRICING_PLANS[plan].limits;
    const limit = limits[resourceType];

    // Get current usage
    const currentFieldMap = {
      menuItems: 'currentMenuItems',
      categories: 'currentCategories',
      banners: 'currentBanners',
      featuredSections: 'currentFeaturedSections',
    } as const;

    const currentField = currentFieldMap[resourceType];
    const currentUsage = (location as any)[currentField] || 0;

    // Check limit (unlimited = -1)
    if (limit !== -1 && currentUsage >= limit) {
      const upgradePlan = this.getUpgradePlan(plan, resourceType);
      return {
        allowed: false,
        reason: `${this.formatResourceName(resourceType)} limit reached (${currentUsage}/${limit})`,
        currentUsage,
        limit,
        upgradePlan,
      };
    }

    // Increment usage
    await prisma.location.update({
      where: { id: locationId },
      data: {
        [currentField]: currentUsage + 1,
        lastUsageUpdate: new Date(),
      },
    });

    return { allowed: true };
  }

  /**
   * Decrement usage counter
   */
  private async decrementUsage(
    locationId: string,
    field: 'currentMenuItems' | 'currentCategories' | 'currentBanners' | 'currentFeaturedSections'
  ): Promise<void> {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { [field]: true },
    });

    if (location) {
      const current = (location as any)[field] || 0;
      const newValue = Math.max(0, current - 1);

      await prisma.location.update({
        where: { id: locationId },
        data: {
          [field]: newValue,
          lastUsageUpdate: new Date(),
        },
      });
    }
  }

  /**
   * Check monthly upload limit (without tracking)
   */
  private async checkMonthlyUpload(
    locationId: string,
    field: 'monthlyImageUploads' | 'monthlyVideoUploads',
    limitField: 'monthlyImageUploads' | 'monthlyVideoUploads'
  ): Promise<TrackResult> {
    const location = await this.getLocationWithSubscription(locationId);
    if (!location) {
      return { allowed: false, reason: 'Location not found' };
    }

    // Check if monthly reset is needed
    await this.checkAndResetMonthlyLimits(locationId);

    const plan = (location.subscriptionPlan || 'FREE') as keyof typeof PRICING_PLANS;
    const limits = PRICING_PLANS[plan].limits;
    const limit = limits[limitField];
    const currentUsage = (location as any)[field] || 0;

    // Check limit (unlimited = -1)
    if (limit !== -1 && currentUsage >= limit) {
      const upgradePlan = this.getUpgradePlan(plan, limitField);
      return {
        allowed: false,
        reason: `Monthly ${limitField} limit reached (${currentUsage}/${limit})`,
        currentUsage,
        limit,
        upgradePlan,
      };
    }

    return { allowed: true };
  }

  /**
   * Track monthly upload (images/videos)
   * This increments the counter - use checkMonthlyUpload for validation only
   */
  private async trackMonthlyUpload(
    locationId: string,
    field: 'monthlyImageUploads' | 'monthlyVideoUploads',
    limitField: 'monthlyImageUploads' | 'monthlyVideoUploads'
  ): Promise<TrackResult> {
    const location = await this.getLocationWithSubscription(locationId);
    if (!location) {
      return { allowed: false, reason: 'Location not found' };
    }

    // Check if monthly reset is needed
    await this.checkAndResetMonthlyLimits(locationId);

    const plan = (location.subscriptionPlan || 'FREE') as keyof typeof PRICING_PLANS;
    const limits = PRICING_PLANS[plan].limits;
    const limit = limits[limitField];
    const currentUsage = (location as any)[field] || 0;

    // Check limit (unlimited = -1)
    if (limit !== -1 && currentUsage >= limit) {
      const upgradePlan = this.getUpgradePlan(plan, limitField);
      return {
        allowed: false,
        reason: `Monthly ${limitField} limit reached (${currentUsage}/${limit})`,
        currentUsage,
        limit,
        upgradePlan,
      };
    }

    // Increment usage
    await prisma.location.update({
      where: { id: locationId },
      data: {
        [field]: currentUsage + 1,
        lastUsageUpdate: new Date(),
      },
    });

    return { allowed: true };
  }

  /**
   * Check and reset monthly limits if needed
   */
  private async checkAndResetMonthlyLimits(locationId: string): Promise<void> {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { monthlyUploadResetDate: true },
    });

    if (!location) return;

    const resetDate = location.monthlyUploadResetDate;
    const now = new Date();

    // If reset date is null or has passed, reset
    if (!resetDate || resetDate <= now) {
      await this.resetMonthlyLimits(locationId);
    }
  }

  /**
   * Get location with subscription
   */
  private async getLocationWithSubscription(locationId: string) {
    return prisma.location.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        currentMenuItems: true,
        currentCategories: true,
        currentBanners: true,
        currentFeaturedSections: true,
        currentStorageBytes: true,
        monthlyImageUploads: true,
        monthlyVideoUploads: true,
        monthlyUploadResetDate: true,
        subscription: {
          select: {
            gracePeriodEndsAt: true,
            gracePeriodStatus: true,
          },
        },
      },
    });
  }

  /**
   * Calculate percentage
   */
  private calculatePercentage(current: number, limit: number): number {
    if (limit === -1) return 0; // Unlimited
    if (limit === 0) return current > 0 ? 100 : 0;
    return Math.round((current / limit) * 100);
  }

  /**
   * Generate warnings for resources approaching limits
   */
  private generateWarnings(
    limits: PlanLimits,
    _current: CurrentUsage,
    percentages: UsagePercentages,
    plan: string
  ): UsageWarning[] {
    const warnings: UsageWarning[] = [];

    // Check each resource
    if (percentages.menuItems >= 80 && limits.menuItems !== -1) {
      warnings.push({
        resource: 'menuItems',
        percentage: percentages.menuItems,
        message: `You've used ${percentages.menuItems}% of your menu items limit`,
        upgradePlan: this.getUpgradePlan(plan as any, 'menuItems'),
      });
    }

    if (percentages.categories >= 80 && limits.categories !== -1) {
      warnings.push({
        resource: 'categories',
        percentage: percentages.categories,
        message: `You've used ${percentages.categories}% of your categories limit`,
        upgradePlan: this.getUpgradePlan(plan as any, 'categories'),
      });
    }

    if (percentages.banners >= 80 && limits.banners !== -1) {
      warnings.push({
        resource: 'banners',
        percentage: percentages.banners,
        message: `You've used ${percentages.banners}% of your banners limit`,
        upgradePlan: this.getUpgradePlan(plan as any, 'banners'),
      });
    }

    if (percentages.storage >= 80 && limits.imageStorageBytes !== -1) {
      warnings.push({
        resource: 'storage',
        percentage: percentages.storage,
        message: `You've used ${percentages.storage}% of your storage limit`,
        upgradePlan: this.getUpgradePlan(plan as any, 'storage'),
      });
    }

    return warnings;
  }

  /**
   * Get upgrade plan recommendation
   */
  private getUpgradePlan(
    currentPlan: keyof typeof PRICING_PLANS,
    resource: string
  ): SubscriptionPlan | undefined {
    const planOrder: (keyof typeof PRICING_PLANS)[] = ['FREE', 'STANDARD', 'PROFESSIONAL', 'CUSTOM'];
    const currentIndex = planOrder.indexOf(currentPlan);

    // Find next plan that has higher limits
    for (let i = currentIndex + 1; i < planOrder.length; i++) {
      const plan = planOrder[i];
      const limits = PRICING_PLANS[plan].limits;

      // Check if this plan has higher limits for the resource
      if (resource === 'menuItems' && limits.menuItems === -1) {
        return plan as SubscriptionPlan;
      }
      if (resource === 'categories' && limits.categories === -1) {
        return plan as SubscriptionPlan;
      }
      if (resource === 'banners' && limits.banners === -1) {
        return plan as SubscriptionPlan;
      }
      if (resource === 'storage' && limits.imageStorageBytes === -1) {
        return plan as SubscriptionPlan;
      }
    }

    return undefined;
  }

  /**
   * Get grace period information
   */
  private async getGracePeriodInfo(locationId: string): Promise<GracePeriodInfo | undefined> {
    const subscription = await prisma.subscription.findUnique({
      where: { locationId },
      select: {
        gracePeriodEndsAt: true,
        gracePeriodStatus: true,
      },
    });

    if (!subscription || !subscription.gracePeriodEndsAt) {
      return undefined;
    }

    const now = new Date();
    const endsAt = subscription.gracePeriodEndsAt;
    const isActive = subscription.gracePeriodStatus === 'ACTIVE' && endsAt > now;
    const daysRemaining = isActive
      ? Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      isActive,
      endsAt,
      daysRemaining,
    };
  }

  /**
   * Format resource name for error messages
   */
  private formatResourceName(resource: string): string {
    const names: Record<string, string> = {
      menuItems: 'Menu items',
      categories: 'Categories',
      banners: 'Banners',
      featuredSections: 'Featured sections',
    };
    return names[resource] || resource;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

export default new UsageTrackingService();

