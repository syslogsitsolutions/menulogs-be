/**
 * Usage Tracking Types
 * 
 * Type definitions for subscription usage tracking and limits.
 * 
 * @module types/usage
 */

import { SubscriptionPlan } from '@prisma/client';

/**
 * Plan limits structure
 */
export interface PlanLimits {
  menuItems: number; // -1 for unlimited
  categories: number; // -1 for unlimited
  banners: number; // -1 for unlimited
  featuredSections: number; // -1 for unlimited
  imageStorageBytes: number; // -1 for unlimited
  videoStorageBytes: number; // -1 for unlimited
  monthlyImageUploads: number; // -1 for unlimited
  monthlyVideoUploads: number; // -1 for unlimited
  teamMembers: number; // -1 for unlimited
}

/**
 * Current usage structure
 */
export interface CurrentUsage {
  menuItems: number;
  categories: number;
  banners: number;
  featuredSections: number;
  storageBytes: bigint | string; // BigInt as string for JSON serialization
  monthlyImageUploads: number;
  monthlyVideoUploads: number;
}

/**
 * Usage percentages structure
 */
export interface UsagePercentages {
  menuItems: number; // 0-100+
  categories: number;
  banners: number;
  featuredSections: number;
  storage: number;
  monthlyImageUploads: number;
  monthlyVideoUploads: number;
}

/**
 * Grace period information
 */
export interface GracePeriodInfo {
  isActive: boolean;
  endsAt: Date | null;
  daysRemaining: number | null;
}

/**
 * Usage summary structure
 */
export interface UsageSummary {
  plan: SubscriptionPlan;
  limits: PlanLimits;
  current: CurrentUsage;
  percentages: UsagePercentages;
  upgradeRecommended: boolean;
  gracePeriod?: GracePeriodInfo;
  warnings: UsageWarning[];
}

/**
 * Usage warning structure
 */
export interface UsageWarning {
  resource: string;
  percentage: number;
  message: string;
  upgradePlan?: SubscriptionPlan;
}

/**
 * Track result structure
 */
export interface TrackResult {
  allowed: boolean;
  reason?: string;
  currentUsage?: number;
  limit?: number;
  upgradePlan?: SubscriptionPlan;
}

