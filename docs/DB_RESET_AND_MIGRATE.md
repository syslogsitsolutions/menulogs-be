# Database Reset and Migration Regeneration Guide

This guide explains how to reset your database and regenerate migrations from scratch.

## ⚠️ WARNING

**This will delete ALL data in your database!** Only use this when:
- In development environment
- You have no active customers/production data
- You want to start fresh with a clean migration history

---

## Option 1: Reset Database and Keep Existing Migrations

If you just want to reset the database but keep your migration history:

### Local Development

```bash
# Navigate to backend directory
cd backend

# Reset database (drops all tables and reapplies migrations)
npx prisma migrate reset

# Or use the npm script
npm run db:reset --yes
```

### Production (EC2)

```bash
# SSH into EC2
ssh ec2-user@your-ec2-ip

# Navigate to project directory
cd /opt/menulogs/prod

# Reset database (inside Docker container)
docker-compose exec backend npx prisma migrate reset --force

# Or if you need to set environment variable
docker-compose exec -e PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 backend npx prisma migrate reset --force
```

---

## Option 2: Reset Database and Regenerate Migrations (Fresh Start)

This will delete all existing migrations and create a new initial migration from your current schema.

### Step 1: Backup Existing Migrations (Optional)

```bash
# Navigate to backend directory
cd backend

# Backup migrations folder (optional, for reference)
cp -r prisma/migrations prisma/migrations.backup
```

### Step 2: Reset Database and Delete Migrations

#### Local Development

```bash
# 1. Drop all database tables
npx prisma migrate reset --force --skip-seed

# 2. Delete all migration files
rm -rf prisma/migrations/*

# 3. Remove migration_lock.toml (if exists)
rm -f prisma/migrations/migration_lock.toml
```

#### Production (EC2)

```bash
# SSH into EC2
ssh ec2-user@your-ec2-ip
cd /opt/menulogs/prod

# 1. Drop all database tables (inside Docker)
docker-compose exec backend npx prisma migrate reset --force --skip-seed

# 2. Delete migration files (on host)
docker-compose exec backend rm -rf /app/prisma/migrations/*

# 3. Remove migration_lock.toml
docker-compose exec backend rm -f /app/prisma/migrations/migration_lock.toml
```

### Step 3: Create New Initial Migration

#### Local Development

```bash
# Create a new initial migration from your current schema
npx prisma migrate dev --name init

# This will:
# - Generate Prisma Client
# - Create a new migration in prisma/migrations/
# - Apply the migration to your database
```

#### Production (EC2)

**Important:** For production, you should create migrations locally first, then deploy them.

```bash
# On your local machine
cd backend

# Create the migration
npx prisma migrate dev --name init --create-only

# Review the generated SQL in prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql

# Commit and push to your repository
git add prisma/migrations/
git commit -m "chore: regenerate initial migration"
git push

# Then on EC2, pull the changes and apply
ssh ec2-user@your-ec2-ip
cd /opt/menulogs/prod
git pull origin main  # or your branch name

# Rebuild and restart containers
docker-compose down
docker-compose up -d --build

# Apply migrations
docker-compose exec -e PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 backend npx prisma migrate deploy
```

### Step 4: Verify Migration

```bash
# Check migration status
npx prisma migrate status

# Or in production
docker-compose exec backend npx prisma migrate status
```

---

## Option 3: Quick Reset Script (Local Development)

Create a script to automate the process:

```bash
# Create reset script
cat > backend/scripts/reset-and-regenerate.sh << 'EOF'
#!/bin/bash

set -e

echo "⚠️  WARNING: This will delete ALL data and migrations!"
read -p "Are you sure? Type 'yes' to continue: " confirm

if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "Resetting database..."
npx prisma migrate reset --force --skip-seed

echo "Deleting old migrations..."
rm -rf prisma/migrations/*
rm -f prisma/migrations/migration_lock.toml

echo "Creating new initial migration..."
npx prisma migrate dev --name init

echo "✅ Database reset and migration regenerated!"
echo "Next steps:"
echo "  1. Review the migration: cat prisma/migrations/*/migration.sql"
echo "  2. Seed the database: npm run prisma:seed"
EOF

# Make it executable
chmod +x backend/scripts/reset-and-regenerate.sh

# Run it
./backend/scripts/reset-and-regenerate.sh
```

---

## Troubleshooting

### Error: "Migration directory is not empty"

```bash
# Make sure you delete all files in migrations directory
rm -rf prisma/migrations/*
# Then try again
```

### Error: "Database is not empty"

```bash
# Force reset
npx prisma migrate reset --force
```

### Error: "Prisma Client is out of date"

```bash
# Regenerate Prisma Client
npx prisma generate
```

### Error: "The datasource property `url` is no longer supported"

Make sure your `prisma.config.js` is correct:

```javascript
// prisma.config.js
require('dotenv').config();

module.exports = {
  datasource: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL,
  },
};
```

And your `schema.prisma` should NOT have `url` in the datasource block:

```prisma
datasource db {
  provider = "postgresql"
  // url is in prisma.config.js, not here
}
```

---

## Best Practices

1. **Always backup production data** before resetting
2. **Create migrations locally** and test them before deploying
3. **Review generated SQL** before applying to production
4. **Use version control** - commit migrations to Git
5. **Document schema changes** in migration names (e.g., `add_user_email_index`)

---

## Related Commands

```bash
# View migration status
npx prisma migrate status

# Create a new migration (after schema changes)
npx prisma migrate dev --name your_migration_name

# Apply migrations in production
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate

# Open Prisma Studio (database GUI)
npx prisma studio
```

