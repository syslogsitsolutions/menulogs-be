/**
 * Migration Script: Add slug field to existing locations
 * This script:
 * 1. Adds slug column to locations table
 * 2. Generates and populates slugs for existing locations
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Slug generation function (duplicated here for migration independence)
const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

async function main() {
  console.log('🚀 Starting migration: Add location slug...\n');

  try {
    // Step 1: Add slug column (nullable)
    console.log('📝 Step 1: Adding slug column to locations table...');
    await prisma.$executeRaw`
      ALTER TABLE locations 
      ADD COLUMN IF NOT EXISTS slug VARCHAR(50) UNIQUE;
    `;
    console.log('✅ Slug column added\n');

    // Step 2: Fetch all existing locations
    console.log('📝 Step 2: Fetching existing locations...');
    const locations = await prisma.location.findMany({
      where: {
        slug: null,
      },
      select: {
        id: true,
        name: true,
        city: true,
      },
    });
    console.log(`Found ${locations.length} locations without slugs\n`);

    // Step 3: Generate and update slugs
    console.log('📝 Step 3: Generating and updating slugs...');
    const slugCounts: { [key: string]: number } = {};

    for (const location of locations) {
      // Generate base slug from name and city
      const baseSlug = generateSlug(`${location.name}-${location.city}`);
      
      // Handle duplicates by appending counter
      let slug = baseSlug;
      if (slugCounts[baseSlug]) {
        slugCounts[baseSlug]++;
        slug = `${baseSlug}-${slugCounts[baseSlug]}`;
      } else {
        slugCounts[baseSlug] = 1;
      }

      // Update location with slug
      await prisma.location.update({
        where: { id: location.id },
        data: { slug },
      });

      console.log(`  ✓ ${location.name} → ${slug}`);
    }

    console.log('\n✅ All slugs generated and updated successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Total locations updated: ${locations.length}`);
    console.log(`   Unique base slugs: ${Object.keys(slugCounts).length}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

