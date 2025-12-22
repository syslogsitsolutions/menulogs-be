-- Migration: Update Subscription Plans from STARTER/ENTERPRISE to STANDARD/CUSTOM
-- Date: 2024-12-20
-- Description: Updates subscription plan enum and adds new fields for usage tracking and feature flags
-- Note: Database can be reset - no need to migrate existing data

-- Step 1: Create new enum type with updated values
DO $$ BEGIN
  CREATE TYPE "SubscriptionPlan_new" AS ENUM ('FREE', 'STANDARD', 'PROFESSIONAL', 'CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add new columns to subscriptions table
ALTER TABLE "subscriptions" 
  ADD COLUMN IF NOT EXISTS "teamMemberLimit" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "customDomainEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "apiAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "whiteLabelEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ssoEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "gracePeriodEndsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "gracePeriodStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "lastPaymentAttempt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dunningStatus" TEXT;

-- Step 3: Add temporary column with new enum type
ALTER TABLE "subscriptions" 
  ADD COLUMN IF NOT EXISTS "plan_new" "SubscriptionPlan_new";

ALTER TABLE "locations" 
  ADD COLUMN IF NOT EXISTS "subscriptionPlan_new" "SubscriptionPlan_new";

-- Step 4: Set default values for new columns (for existing test data)
-- Since we're resetting, this is mainly for safety
UPDATE "subscriptions" 
SET "plan_new" = 'FREE'::"SubscriptionPlan_new"
WHERE "plan_new" IS NULL;

UPDATE "locations" 
SET "subscriptionPlan_new" = 'FREE'::"SubscriptionPlan_new"
WHERE "subscriptionPlan_new" IS NULL;

-- Step 5: Drop old columns and rename new ones
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "plan";
ALTER TABLE "subscriptions" RENAME COLUMN "plan_new" TO "plan";
ALTER TABLE "subscriptions" ALTER COLUMN "plan" SET NOT NULL;

ALTER TABLE "locations" DROP COLUMN IF EXISTS "subscriptionPlan";
ALTER TABLE "locations" RENAME COLUMN "subscriptionPlan_new" TO "subscriptionPlan";
ALTER TABLE "locations" ALTER COLUMN "subscriptionPlan" SET NOT NULL;

-- Step 6: Drop old enum type
DROP TYPE IF EXISTS "SubscriptionPlan";

-- Step 7: Rename new enum to original name
ALTER TYPE "SubscriptionPlan_new" RENAME TO "SubscriptionPlan";

-- Step 8: Add usage tracking columns to locations table
ALTER TABLE "locations"
  ADD COLUMN IF NOT EXISTS "currentMenuItems" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currentCategories" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currentBanners" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currentFeaturedSections" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currentStorageBytes" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monthlyImageUploads" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monthlyVideoUploads" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monthlyUploadResetDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastUsageUpdate" TIMESTAMP(3);

-- Step 9: Create indexes for performance
CREATE INDEX IF NOT EXISTS "subscriptions_endDate_idx" ON "subscriptions"("endDate") WHERE "endDate" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "subscriptions_nextBillingDate_idx" ON "subscriptions"("nextBillingDate") WHERE "nextBillingDate" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "subscriptions_gracePeriodEndsAt_idx" ON "subscriptions"("gracePeriodEndsAt") WHERE "gracePeriodEndsAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "locations_trialEndsAt_idx" ON "locations"("trialEndsAt") WHERE "trialEndsAt" IS NOT NULL;
