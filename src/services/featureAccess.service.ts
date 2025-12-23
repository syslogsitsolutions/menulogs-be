/**
 * Feature Access Service
 * 
 * Manages feature access based on subscription plans.
 * Provides methods to check if a plan includes specific features.
 * 
 * @module services/featureAccess
 */

import { SubscriptionPlan } from '@prisma/client';
// Feature names as constants
export const FEATURES = {
  CUSTOM_DOMAIN: 'customDomain',
  API_ACCESS: 'apiAccess',
  WHITE_LABEL: 'whiteLabel',
  SSO: 'sso',
  MULTI_LANGUAGE: 'multiLanguage',
  MENU_VERSIONING: 'menuVersioning',
  AB_TESTING: 'abTesting',
  CUSTOM_WORKFLOWS: 'customWorkflows',
  ADVANCED_ANALYTICS: 'advancedAnalytics',
  CUSTOM_REPORTS: 'customReports',
  EXPORT_DATA: 'exportData',
  REAL_TIME_ANALYTICS: 'realTimeAnalytics',
  CHAT_SUPPORT: 'chatSupport',
  PRIORITY_SUPPORT: 'prioritySupport',
  DEDICATED_MANAGER: 'dedicatedManager',
  PHONE_SUPPORT: 'phoneSupport',
  AUDIT_LOGS: 'auditLogs',
} as const;

export type FeatureName = typeof FEATURES[keyof typeof FEATURES];

// Feature matrix: which plans have which features
const FEATURE_MATRIX: Record<SubscriptionPlan, FeatureName[]> = {
  FREE: [
    // Basic features only
  ],
  STANDARD: [
    // Basic features only
  ],
  PROFESSIONAL: [
    FEATURES.CUSTOM_DOMAIN,
    FEATURES.API_ACCESS,
    FEATURES.MULTI_LANGUAGE,
    FEATURES.MENU_VERSIONING,
    FEATURES.ADVANCED_ANALYTICS,
    FEATURES.CUSTOM_REPORTS,
    FEATURES.EXPORT_DATA,
    FEATURES.REAL_TIME_ANALYTICS,
    FEATURES.CHAT_SUPPORT,
    FEATURES.PRIORITY_SUPPORT,
    FEATURES.AUDIT_LOGS,
  ],
  CUSTOM: [
    FEATURES.CUSTOM_DOMAIN,
    FEATURES.API_ACCESS,
    FEATURES.WHITE_LABEL,
    FEATURES.SSO,
    FEATURES.MULTI_LANGUAGE,
    FEATURES.MENU_VERSIONING,
    FEATURES.AB_TESTING,
    FEATURES.CUSTOM_WORKFLOWS,
    FEATURES.ADVANCED_ANALYTICS,
    FEATURES.CUSTOM_REPORTS,
    FEATURES.EXPORT_DATA,
    FEATURES.REAL_TIME_ANALYTICS,
    FEATURES.CHAT_SUPPORT,
    FEATURES.PRIORITY_SUPPORT,
    FEATURES.DEDICATED_MANAGER,
    FEATURES.PHONE_SUPPORT,
    FEATURES.AUDIT_LOGS,
  ],
};

export class FeatureAccessService {
  /**
   * Check if a plan has a specific feature
   */
  hasFeature(plan: SubscriptionPlan, feature: FeatureName): boolean {
    const features = FEATURE_MATRIX[plan] || [];
    return features.includes(feature);
  }

  /**
   * Get all features available for a plan
   */
  getFeatures(plan: SubscriptionPlan): FeatureName[] {
    return FEATURE_MATRIX[plan] || [];
  }

  /**
   * Check if upgrading to a specific plan would unlock a feature
   * Returns the minimum plan that has the feature, or null if no plan has it
   */
  canUnlockFeature(currentPlan: SubscriptionPlan, feature: FeatureName): SubscriptionPlan | null {
    const planOrder: SubscriptionPlan[] = ['FREE', 'STANDARD', 'PROFESSIONAL', 'CUSTOM'];
    const currentIndex = planOrder.indexOf(currentPlan);

    // Check plans from current to highest
    for (let i = currentIndex + 1; i < planOrder.length; i++) {
      const plan = planOrder[i];
      if (this.hasFeature(plan, feature)) {
        return plan;
      }
    }

    return null;
  }

  /**
   * Get the feature matrix for all plans
   */
  getFeatureMatrix(): Record<SubscriptionPlan, FeatureName[]> {
    return FEATURE_MATRIX;
  }

  /**
   * Check if plan has custom domain feature
   */
  hasCustomDomain(plan: SubscriptionPlan): boolean {
    return this.hasFeature(plan, FEATURES.CUSTOM_DOMAIN);
  }

  /**
   * Check if plan has API access
   */
  hasApiAccess(plan: SubscriptionPlan): boolean {
    return this.hasFeature(plan, FEATURES.API_ACCESS);
  }

  /**
   * Check if plan has white label feature
   */
  hasWhiteLabel(plan: SubscriptionPlan): boolean {
    return this.hasFeature(plan, FEATURES.WHITE_LABEL);
  }

  /**
   * Check if plan has SSO feature
   */
  hasSSO(plan: SubscriptionPlan): boolean {
    return this.hasFeature(plan, FEATURES.SSO);
  }

  /**
   * Check if plan has advanced analytics
   */
  hasAdvancedAnalytics(plan: SubscriptionPlan): boolean {
    return this.hasFeature(plan, FEATURES.ADVANCED_ANALYTICS);
  }

  /**
   * Get upgrade recommendation for a feature
   */
  getUpgradeRecommendation(currentPlan: SubscriptionPlan, feature: FeatureName): {
    canUnlock: boolean;
    minimumPlan: SubscriptionPlan | null;
    currentPlanHasFeature: boolean;
  } {
    const currentPlanHasFeature = this.hasFeature(currentPlan, feature);
    const minimumPlan = this.canUnlockFeature(currentPlan, feature);

    return {
      canUnlock: minimumPlan !== null,
      minimumPlan,
      currentPlanHasFeature,
    };
  }
}

export default new FeatureAccessService();

