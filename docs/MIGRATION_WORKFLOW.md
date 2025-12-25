# Migration Workflow Guide

This guide explains how database migrations work in development and production.

## 📋 Overview

Migrations are SQL files that define database schema changes. They should be:
- **Committed to Git** (version controlled)
- **Included in Docker image** (for `prisma migrate deploy` to work)
- **Applied in order** (Prisma tracks which migrations have been applied)

---

## 🔄 Migration Workflow

### 1. **Development: Create New Migration**

When you change `schema.prisma`:

```bash
# On your local machine
cd backend

# Create a new migration
npx prisma migrate dev --name add_new_feature

# This will:
# - Generate migration SQL file in prisma/migrations/
# - Apply the migration to your local database
# - Regenerate Prisma Client
```

**Example migration name:**
- `add_user_email_index`
- `add_subscription_grace_period`
- `update_menu_item_pricing`

### 2. **Review the Migration**

```bash
# Check the generated SQL
cat prisma/migrations/YYYYMMDDHHMMSS_add_new_feature/migration.sql

# Make sure it looks correct
```

### 3. **Commit to Git**

```bash
# Commit the migration files
git add prisma/migrations/
git add prisma/schema.prisma
git commit -m "feat: add new feature migration"
git push
```

**Important:** Migrations MUST be committed to Git so they're available in production.

---

## 🚀 Production: Apply Migrations

### **Automatic (via CI/CD)**

Your GitHub Actions workflow automatically applies migrations:

```yaml
# From .github/workflows/deploy.yml
- name: Running database migrations...
  docker-compose run --rm \
    -e PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 \
    backend npx prisma migrate deploy
```

**What happens:**
1. GitHub Actions builds Docker image (includes migrations from Git)
2. Pushes image to ECR
3. EC2 pulls new image
4. Runs `prisma migrate deploy` (applies any new migrations)
5. Restarts backend container

### **Manual (if needed)**

If you need to apply migrations manually on EC2:

```bash
# SSH into EC2
ssh ec2-user@your-ec2-ip

# Navigate to project
cd /opt/menulogs/prod

# Pull latest code (if migrations are on host filesystem)
git pull

# Apply migrations
docker-compose exec -e PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 backend npx prisma migrate deploy

# Or if using the image directly
docker-compose run --rm \
  -e PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 \
  backend npx prisma migrate deploy
```

---

## 🏗️ How Migrations Work in Docker

### Current Setup

1. **Migrations are in Git** → Committed to repository
2. **Dockerfile copies migrations** → Included in Docker image
3. **Container has migrations** → Available for `prisma migrate deploy`

### Dockerfile Flow

```dockerfile
# Builder stage copies prisma directory (includes migrations)
COPY prisma ./prisma/

# Production stage copies from builder
COPY --from=builder /app/prisma ./prisma
```

**Result:** Migrations are baked into the Docker image, so they're always available.

---

## ⚠️ Important Notes

### ✅ DO:

1. **Always commit migrations to Git**
   ```bash
   git add prisma/migrations/
   git commit -m "feat: add migration"
   ```

2. **Test migrations locally first**
   ```bash
   npx prisma migrate dev --name test_migration
   # Test your app
   ```

3. **Review migration SQL before committing**
   ```bash
   cat prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql
   ```

4. **Use descriptive migration names**
   - ✅ `add_user_email_index`
   - ✅ `update_subscription_plans`
   - ❌ `migration1`
   - ❌ `fix`

### ❌ DON'T:

1. **Don't delete migrations** (unless resetting entire database)
2. **Don't modify existing migrations** (create a new one instead)
3. **Don't skip migrations** (they must be applied in order)
4. **Don't use `migrate dev` in production** (use `migrate deploy`)

---

## 🔧 Common Scenarios

### Scenario 1: Adding a New Field

```bash
# 1. Update schema.prisma
# Add: emailVerified Boolean @default(false)

# 2. Create migration
npx prisma migrate dev --name add_email_verified

# 3. Commit
git add prisma/
git commit -m "feat: add emailVerified field"
git push

# 4. CI/CD automatically applies in production
```

### Scenario 2: Changing a Field Type

```bash
# 1. Update schema.prisma
# Change: price Decimal → price Float

# 2. Create migration
npx prisma migrate dev --name change_price_to_float

# 3. Review migration (may need data migration)
cat prisma/migrations/*/migration.sql

# 4. Commit and push
```

### Scenario 3: Adding an Index

```bash
# 1. Update schema.prisma
# Add: @@index([email])

# 2. Create migration
npx prisma migrate dev --name add_email_index

# 3. Commit and push
```

### Scenario 4: Production Migration Failed

If a migration fails in production:

```bash
# 1. Check migration status
docker-compose exec backend npx prisma migrate status

# 2. Check logs
docker-compose logs backend | grep -i migration

# 3. Fix the issue (may need to rollback or create fix migration)

# 4. Retry
docker-compose exec backend npx prisma migrate deploy
```

---

## 🐛 Troubleshooting

### Error: "Migration failed to apply"

**Cause:** Migration SQL has an error or conflicts with existing data.

**Fix:**
1. Check migration SQL
2. Test locally first
3. May need to create a fix migration

### Error: "Migration X is not in the migrations directory"

**Cause:** Migration file is missing from Git or Docker image.

**Fix:**
1. Make sure migration is committed to Git
2. Rebuild Docker image
3. Pull latest code on EC2

### Error: "Migration X failed to apply cleanly to shadow database"

**Cause:** Migration references tables/columns that don't exist.

**Fix:**
1. Check migration order (migrations must be sequential)
2. May need to reset database (development only)
3. Create a new migration that fixes the issue

### Error: "The migration directory is not empty"

**Cause:** Trying to create initial migration when migrations already exist.

**Fix:**
- If resetting: Delete all migrations first
- If adding: Use `migrate dev --name new_migration`

---

## 📊 Migration Status

### Check Migration Status

```bash
# Local
npx prisma migrate status

# Production (EC2)
docker-compose exec backend npx prisma migrate status
```

**Output shows:**
- ✅ Applied migrations
- ⏳ Pending migrations
- ❌ Failed migrations

---

## 🔄 Reset vs Deploy

### `prisma migrate dev` (Development)
- Creates new migration files
- Applies to database
- Regenerates Prisma Client
- **Use in:** Local development

### `prisma migrate deploy` (Production)
- Applies pending migrations
- Does NOT create new migrations
- Does NOT regenerate Prisma Client
- **Use in:** Production, CI/CD

### `prisma migrate reset` (Reset)
- Drops all tables
- Reapplies all migrations
- **Use in:** Development only (deletes all data!)

---

## 📝 Summary

1. **Create migrations locally** with `prisma migrate dev`
2. **Commit migrations to Git** (they're version controlled)
3. **Docker image includes migrations** (from Git)
4. **CI/CD applies migrations** automatically via `prisma migrate deploy`
5. **Never modify existing migrations** (create new ones instead)

---

## 🔗 Related Commands

```bash
# Create migration
npx prisma migrate dev --name migration_name

# Apply migrations (production)
npx prisma migrate deploy

# Check status
npx prisma migrate status

# Reset database (⚠️ deletes all data)
npx prisma migrate reset

# Generate Prisma Client
npx prisma generate

# View database
npx prisma studio
```

