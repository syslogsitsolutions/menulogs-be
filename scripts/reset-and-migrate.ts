/**
 * Reset Database and Apply Migration Script
 * 
 * This script resets the database and applies the new subscription plan migration.
 * Use this when you have no active customers and can safely reset the database.
 * 
 * Usage:
 *   npm run db:reset
 * 
 * @module scripts/reset-and-migrate
 */

import { execSync } from 'child_process';
import { logger } from '../src/utils/logger.util';

/**
 * Reset database and apply migrations
 */
function resetAndMigrate(): void {
  try {
    logger.info('Starting database reset and migration...');

    // Reset database (drops all data and applies migrations)
    logger.info('Resetting database...');
    execSync('npx prisma migrate reset --force', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    logger.info('Database reset completed successfully!');
    logger.info('All migrations have been applied.');
    logger.info('You can now seed the database with test data if needed.');

    console.log('\n✅ Database reset and migration completed successfully!\n');
    console.log('Next steps:');
    console.log('  1. Run: npm run prisma:seed (to seed test data)');
    console.log('  2. Start the server: npm run dev\n');
  } catch (error) {
    logger.error('Database reset failed:', error);
    console.error('\n❌ Database reset failed. Please check the error above.\n');
    process.exit(1);
  }
}

/**
 * Main function
 */
function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run db:reset --yes

This script will:
  1. Drop all database tables
  2. Apply all migrations (including the new subscription plan migration)
  3. Reset the database to a clean state

⚠️  WARNING: This will delete ALL data in the database!
Only use this in development or when you have no active customers.

Options:
  --yes          Confirm and proceed with reset
  --help, -h     Show this help message
    `);
    process.exit(0);
  }

  // Confirm before proceeding
  if (!args.includes('--yes')) {
    console.log('\n⚠️  WARNING: This will delete ALL data in the database!');
    console.log('Only use this in development or when you have no active customers.\n');
    console.log('To proceed, run: npm run db:reset --yes\n');
    process.exit(0);
  }

  resetAndMigrate();
}

// Run if called directly
if (require.main === module) {
  main();
}

export { resetAndMigrate };

