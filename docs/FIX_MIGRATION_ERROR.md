# Fix Migration Error: Relation "subscriptions" does not exist

## Problem
The migration `20241220000000_update_subscription_plans` is failing because it tries to modify the `subscriptions` table that doesn't exist. This migration is also out of chronological order.

## Solution: Reset and Regenerate Migrations

Since you want to reset the database anyway, we'll:
1. Resolve the failed migration state
2. Delete all migrations **on the host filesystem** (not inside container)
3. Create a fresh initial migration

---

## Step-by-Step Fix (On EC2 Server)

### IMPORTANT: Delete migrations on HOST, not inside container!

```bash
# Navigate to project directory on EC2
cd /opt/menulogs/prod

# Step 1: Delete all migrations on the HOST filesystem
# (Migrations are mounted as volume, so delete from host)
rm -rf prisma/migrations/*

# Step 2: Remove migration_lock.toml
rm -f prisma/migrations/migration_lock.toml

# Step 3: Verify migrations are deleted
ls -la prisma/migrations/

# Step 4: Create a fresh initial migration (inside container)
docker-compose exec -e PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 backend npx prisma migrate dev --name init

# Step 5: Verify the migration was created
ls -la prisma/migrations/
```

---

## Complete Reset (If Above Doesn't Work)

If Prisma still sees old migrations, do a complete reset:

```bash
# Step 1: Stop containers
docker-compose down

# Step 2: Drop and recreate the database
docker-compose up -d postgres
sleep 5
docker-compose exec postgres psql -U menulogs -d postgres -c "DROP DATABASE IF EXISTS menulogs;"
docker-compose exec postgres psql -U menulogs -d postgres -c "CREATE DATABASE menulogs;"

# Step 3: Delete migrations on HOST filesystem
cd /opt/menulogs/prod
rm -rf prisma/migrations/*
rm -f prisma/migrations/migration_lock.toml

# Step 4: Start all containers
docker-compose up -d

# Step 5: Wait for backend to be ready
sleep 10

# Step 6: Create fresh migration
docker-compose exec -e PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 backend npx prisma migrate dev --name init

# Step 7: Verify
docker-compose exec backend npx prisma migrate status
```

---

## Alternative: Use migrate deploy (Production Mode)

If `migrate dev` keeps failing, use `migrate deploy` instead:

```bash
# Step 1: Delete migrations on HOST
cd /opt/menulogs/prod
rm -rf prisma/migrations/*
rm -f prisma/migrations/migration_lock.toml

# Step 2: Create migration in create-only mode (doesn't apply)
docker-compose exec backend npx prisma migrate dev --name init --create-only

# Step 3: Apply the migration
docker-compose exec -e PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 backend npx prisma migrate deploy
```

---

## If You Want to Keep Migrations Locally

If you want to create the migration on your local machine first:

### On Local Machine:

```bash
cd backend

# 1. Reset local database
npx prisma migrate reset --force --skip-seed

# 2. Delete all migrations
rm -rf prisma/migrations/*

# 3. Create fresh initial migration
npx prisma migrate dev --name init --create-only

# 4. Review the migration
cat prisma/migrations/*/migration.sql

# 5. Commit and push
git add prisma/migrations/
git commit -m "chore: regenerate initial migration"
git push
```

### Then on EC2:

```bash
# Pull changes
cd /opt/menulogs/prod
git pull

# Rebuild containers
docker-compose down
docker-compose up -d --build

# Apply migration
docker-compose exec -e PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 backend npx prisma migrate deploy
```

---

## Troubleshooting

### Error: "Migration failed to apply cleanly to shadow database"

This means Prisma is still seeing old migrations. Make sure you:
1. Delete migrations on the **host filesystem**, not inside the container
2. Check if migrations are in a mounted volume: `docker-compose exec backend ls -la /app/prisma/migrations/`
3. If migrations exist in container but not on host, they're in the Docker image - rebuild the image

### Error: "The underlying table for model X does not exist"

This means the migration is trying to modify a table that doesn't exist. Delete all migrations and create a fresh one.

### Still seeing old migrations?

```bash
# Check what Prisma sees
docker-compose exec backend npx prisma migrate status

# Check migrations directory in container
docker-compose exec backend ls -la /app/prisma/migrations/

# Check migrations directory on host
ls -la /opt/menulogs/prod/prisma/migrations/

# If they differ, migrations are baked into the Docker image
# Rebuild the image:
docker-compose down
docker-compose build --no-cache backend
docker-compose up -d
```
