# Phase 1: Database Schema Migration Guide

## Overview

This guide walks you through Phase 1 of the subscription system update: migrating the database schema from the old plan structure (FREE/STARTER/PROFESSIONAL/ENTERPRISE) to the new structure (FREE/STANDARD/PROFESSIONAL/CUSTOM).

## Prerequisites

- ✅ Development environment set up
- ✅ Prisma CLI installed
- ✅ Database connection configured
- ⚠️ **Note**: This will reset your database. Only use in development!

## Quick Start (Recommended - Reset Database)

Since there are no active customers, the easiest approach is to reset the database:

```bash
cd backend

# Reset database and apply all migrations
npm run db:reset --yes

# Seed test data (optional)
npm run prisma:seed

# Start the server
npm run dev
```

This will:
- Drop all existing tables
- Apply all migrations (including the new subscription plan migration)
- Give you a clean database with the new schema

## Manual Migration Steps (If you prefer not to reset)

### Step 1: Review Schema Changes

The schema has been updated with:
- New `SubscriptionPlan` enum: FREE, STANDARD, PROFESSIONAL, CUSTOM
- New fields in `Subscription` model:
  - Feature flags (teamMemberLimit, customDomainEnabled, etc.)
  - Grace period fields (gracePeriodEndsAt, gracePeriodStatus)
  - Payment retry fields (lastPaymentAttempt, paymentRetryCount, dunningStatus)
- New usage tracking fields in `Location` model:
  - currentMenuItems, currentCategories, currentBanners, etc.
  - Storage tracking fields
  - Monthly upload counters

### Step 2: Generate Prisma Client

```bash
cd backend
npm run prisma:generate
```

This will generate the updated TypeScript types based on the new schema.

### Step 3: Run Database Migration

**Option A: Using Prisma Migrate (Recommended)**

```bash
# Create and apply migration
npm run prisma:migrate

# Or manually create migration
npx prisma migrate dev --name update_subscription_plans
```

**Option B: Manual SQL Migration**

If you prefer to run the SQL manually:

```bash
# Review the migration SQL
cat prisma/migrations/20241220000000_update_subscription_plans/migration.sql

# Run the migration SQL directly on your database
psql -d your_database -f prisma/migrations/20241220000000_update_subscription_plans/migration.sql
```

### Step 4: Verify Migration

After running the migration, verify:

1. **Check Subscription Plans:**
   ```sql
   SELECT DISTINCT plan FROM subscriptions;
   -- Should show: FREE, STANDARD, PROFESSIONAL, CUSTOM (no STARTER or ENTERPRISE)
   ```

2. **Check Location Plans:**
   ```sql
   SELECT DISTINCT "subscriptionPlan" FROM locations;
   -- Should show: FREE, STANDARD, PROFESSIONAL, CUSTOM
   ```

3. **Check Feature Flags:**
   ```sql
   SELECT plan, "customDomainEnabled", "apiAccessEnabled", "whiteLabelEnabled"
   FROM subscriptions
   GROUP BY plan, "customDomainEnabled", "apiAccessEnabled", "whiteLabelEnabled";
   ```

4. **Check Usage Tracking:**
   ```sql
   SELECT 
     id,
     "currentMenuItems",
     "currentCategories",
     "currentBanners",
     "currentStorageBytes"
   FROM locations
   LIMIT 10;
   ```

5. **Check Indexes:**
   ```sql
   SELECT indexname, indexdef
   FROM pg_indexes
   WHERE tablename IN ('subscriptions', 'locations')
   AND indexname LIKE '%subscription%' OR indexname LIKE '%trial%' OR indexname LIKE '%grace%';
   ```

### Step 6: Test Application

1. **Start the backend:**
   ```bash
   npm run dev
   ```

2. **Test API endpoints:**
   - GET `/api/v1/subscriptions/plans` - Should return new plans
   - GET `/api/v1/subscriptions/:locationId` - Should work with new plans
   - Verify no TypeScript errors

3. **Check logs:**
   - Look for any errors related to subscription plans
   - Verify no enum value errors

## Rollback Procedure

If you need to rollback the migration, simply reset the database again:

```bash
# Reset database (this will apply all migrations from scratch)
npm run db:reset --yes
```

Or manually revert the Prisma schema:

```bash
git checkout HEAD -- prisma/schema.prisma
npm run prisma:generate
npm run db:reset --yes
```

## Troubleshooting

### Issue: Enum value not found

**Error:** `Invalid value for enum SubscriptionPlan`

**Solution:**
1. Ensure migration SQL ran successfully
2. Regenerate Prisma client: `npm run prisma:generate`
3. Restart the application

### Issue: Column doesn't exist

**Error:** `column "currentMenuItems" does not exist`

**Solution:**
1. Check if migration SQL completed successfully
2. Verify all columns were created:
   ```sql
   \d locations
   \d subscriptions
   ```


### Issue: Feature flags not set correctly

**Solution:**
1. Manually update feature flags:
   ```sql
   UPDATE subscriptions
   SET 
     "teamMemberLimit" = CASE 
       WHEN plan = 'STANDARD' THEN 2
       WHEN plan = 'PROFESSIONAL' THEN 5
       WHEN plan = 'CUSTOM' THEN 999999
       ELSE 2
     END,
     "customDomainEnabled" = plan != 'STANDARD',
     "apiAccessEnabled" = plan != 'STANDARD',
     "whiteLabelEnabled" = plan = 'CUSTOM',
     "ssoEnabled" = plan = 'CUSTOM'
   WHERE plan != 'FREE';
   ```

## Success Criteria

Phase 1 is complete when:

- ✅ Database reset completed successfully
- ✅ All migrations applied (including subscription plan update)
- ✅ Usage tracking fields created
- ✅ Feature flag fields created
- ✅ Indexes created
- ✅ Application starts without errors
- ✅ Prisma client generated successfully
- ✅ No TypeScript errors
- ✅ Manual testing passed

## Next Steps

After Phase 1 is complete and tested:

1. ✅ Mark Phase 1 as complete in TODO
2. ✅ Document any issues encountered
3. ✅ Proceed to Phase 2: Core Service Updates

## Support

If you encounter issues:
1. Check the migration logs
2. Review the SQL migration file
3. Check Prisma migration status: `npx prisma migrate status`
4. Review application logs for errors

---

**Last Updated:** December 2024  
**Phase:** 1 of 10  
**Status:** Ready for Implementation

