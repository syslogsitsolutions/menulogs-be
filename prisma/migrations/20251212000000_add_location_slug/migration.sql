-- AlterTable
-- Add slug column to locations table
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "slug" VARCHAR(255);

-- CreateIndex
-- Add unique constraint on slug
CREATE UNIQUE INDEX IF NOT EXISTS "locations_slug_key" ON "locations"("slug");

-- CreateIndex
-- Add index on slug for fast lookups
CREATE INDEX IF NOT EXISTS "locations_slug_idx" ON "locations"("slug");

-- Note: Slug population for existing locations should be handled separately using
-- the utility function in backend/src/utils/slug.util.ts via:
-- npx ts-node backend/scripts/add-location-slug.ts
-- 
-- For fresh database setups, slugs will be auto-generated when locations are created
-- using the LocationController which uses the slug utility functions.

-- Make slug required (NOT NULL)
-- Note: Run the migration script first if you have existing locations without slugs
ALTER TABLE "locations" ALTER COLUMN "slug" SET NOT NULL;

