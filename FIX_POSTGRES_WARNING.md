# Fix POSTGRES_PASSWORD Warning

## The Warning

```
WARN[0000] The "POSTGRES_PASSWORD" variable is not set. Defaulting to a blank string.
```

This warning appears because docker-compose checks for environment variables **before** reading the `.env` file.

## Solutions

### Option 1: Set Default in docker-compose.yml (Recommended)

Add a default value in your `docker-compose.yml`:

```yaml
services:
  postgres:
    environment:
      POSTGRES_USER: menulogs
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ChangeThisPassword123!}  # Default value
      POSTGRES_DB: menulogs
```

### Option 2: Export Environment Variable

Before running docker-compose commands:

```bash
export POSTGRES_PASSWORD=$(grep POSTGRES_PASSWORD .env | cut -d '=' -f2)
docker-compose restart backend
```

### Option 3: Source .env File

```bash
# Load .env file
set -a
source .env
set +a

docker-compose restart backend
```

### Option 4: Use --env-file Explicitly

```bash
docker-compose --env-file .env restart backend
```

## Verify Your .env File

Make sure your `.env` file has `POSTGRES_PASSWORD` set:

```bash
# Check if POSTGRES_PASSWORD exists in .env
grep POSTGRES_PASSWORD .env

# If not, add it:
echo "POSTGRES_PASSWORD=your-secure-password" >> .env
```

## Update Deployment Script

Update your deployment script to handle this:

```bash
# In your deployment script, before docker-compose commands:
cd /opt/menulogs/prod

# Load environment variables
set -a
[ -f .env ] && source .env
set +a

# Now run docker-compose commands
docker-compose restart backend
```

## Quick Fix for Current Issue

If the warning is just annoying and everything works, you can ignore it. But to fix it:

1. **On EC2**, edit your `docker-compose.yml`:
   ```bash
   cd /opt/menulogs/prod
   nano docker-compose.yml
   ```

2. **Change this line:**
   ```yaml
   POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
   ```
   
   **To:**
   ```yaml
   POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-}
   ```

   Or better, add a default:
   ```yaml
   POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ChangeThisPassword123!}
   ```

3. **Save and restart:**
   ```bash
   docker-compose restart backend
   ```

## Why This Happens

Docker Compose v2 checks for environment variables in this order:
1. Shell environment variables
2. `.env` file
3. Default values (if specified with `:-`)

The warning appears at step 1, before it reads the `.env` file. This is just a warning - if your `.env` file has the password, it will work fine.

