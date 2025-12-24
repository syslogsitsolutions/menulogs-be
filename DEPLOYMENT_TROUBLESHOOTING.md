# Deployment Troubleshooting Guide

## Issue: Latest Code Changes Not Reflecting in Deployment

### Symptoms
- New Docker images are created in ECR
- But server logs show old code
- Code changes (like adding dots to log messages) don't appear

### Root Causes

1. **Docker Build Cache** - Docker is using cached layers from previous builds
2. **Stale Image in Deployment** - Deployment is using an old image tag
3. **Build Not Including Latest Files** - Source files not properly copied during build

## Solutions

### Solution 1: Force Fresh Build (Recommended)

Build without cache to ensure all code is rebuilt:

```bash
# Build with --no-cache flag
docker build --no-cache \
  --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --build-arg BUILD_VERSION="$(git rev-parse --short HEAD)" \
  -t your-ecr-repo/menulogs-backend:latest \
  .

# Or use the provided build script
chmod +x build-and-push.sh
./build-and-push.sh
```

### Solution 2: Use Unique Image Tags

Instead of always using `:latest`, use versioned tags:

```bash
# Build with version tag
VERSION=$(git rev-parse --short HEAD)
docker build \
  -t your-ecr-repo/menulogs-backend:${VERSION} \
  -t your-ecr-repo/menulogs-backend:latest \
  .

# Push both tags
docker push your-ecr-repo/menulogs-backend:${VERSION}
docker push your-ecr-repo/menulogs-backend:latest
```

### Solution 3: Verify Build Contents

Check if your changes are in the built image:

```bash
# Build the image
docker build -t menulogs-backend:test .

# Check the built dist/server.js file
docker run --rm menulogs-backend:test cat dist/server.js | grep "Redis connected"

# Should show: logger.info('✅ Redis connected...');
```

### Solution 4: Force Deployment to Pull Latest Image

If using Docker Compose or ECS:

**Docker Compose:**
```bash
# Pull latest image before starting
docker compose pull
docker compose up -d --force-recreate
```

**ECS:**
```bash
# Force new deployment
aws ecs update-service \
  --cluster your-cluster \
  --service your-service \
  --force-new-deployment
```

**Kubernetes:**
```bash
# Delete pod to force recreation with new image
kubectl delete pod -l app=menulogs-backend

# Or restart deployment
kubectl rollout restart deployment menulogs-backend
```

### Solution 5: Check Build Logs

Verify the build actually compiled your changes:

```bash
# Build with verbose output
docker build --progress=plain --no-cache -t menulogs-backend:test .

# Look for:
# - "Copy source code" step
# - "npm run build" step
# - Check if dist/server.js was generated
```

### Solution 6: Verify Source Files Are Copied

Check if your source files are being copied:

```bash
# Build and inspect
docker build -t menulogs-backend:test .
docker run --rm menulogs-backend:test ls -la src/

# Check if server.ts has your changes
docker run --rm menulogs-backend:test cat src/server.ts | grep "Redis connected"
```

## Quick Fix Commands

### Complete Rebuild and Deploy

```bash
# 1. Clean up old images
docker rmi $(docker images -q your-ecr-repo/menulogs-backend) 2>/dev/null || true

# 2. Build fresh (no cache)
docker build --no-cache \
  --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  -t your-ecr-repo/menulogs-backend:latest \
  .

# 3. Tag and push
docker tag your-ecr-repo/menulogs-backend:latest your-ecr-repo/menulogs-backend:$(date +%Y%m%d-%H%M%S)
docker push your-ecr-repo/menulogs-backend:latest
docker push your-ecr-repo/menulogs-backend:$(date +%Y%m%d-%H%M%S)

# 4. Force deployment update
# (Use your deployment method - ECS, Kubernetes, etc.)
```

## Prevention

### 1. Always Use Build Args

The Dockerfile now includes build args that help track builds:

```dockerfile
ARG BUILD_DATE
ARG BUILD_VERSION
ENV BUILD_DATE=${BUILD_DATE}
ENV BUILD_VERSION=${BUILD_VERSION}
```

### 2. Use Version Tags

Instead of always pushing `:latest`, use semantic versioning or commit hashes:

```bash
VERSION=$(git describe --tags --always)
docker build -t repo:${VERSION} -t repo:latest .
```

### 3. Verify Before Deploy

Always verify the built image contains your changes:

```bash
# Quick verification
docker run --rm your-image:tag node -e "console.log(require('./dist/server.js'))"
```

### 4. Check Deployment Logs

After deployment, immediately check logs:

```bash
# Docker Compose
docker compose logs -f menulogs-backend-prod

# ECS
aws ecs describe-tasks --cluster your-cluster --tasks $(aws ecs list-tasks --cluster your-cluster --service-name your-service --query 'taskArns[0]' --output text) --query 'tasks[0].containers[0].lastStatus'

# Kubernetes
kubectl logs -f deployment/menulogs-backend
```

## Common Mistakes

1. **Using `:latest` tag without pulling** - Always pull before deploying
2. **Not clearing build cache** - Use `--no-cache` when code changes don't reflect
3. **Deploying old image** - Verify image digest matches your build
4. **Not checking .dockerignore** - Ensure source files aren't excluded

## Verification Checklist

After deployment, verify:

- [ ] Build logs show latest source files copied
- [ ] Build logs show TypeScript compilation completed
- [ ] Image digest matches your latest build
- [ ] Deployment pulled the latest image
- [ ] Container logs show your code changes
- [ ] Application is running with new code

## Still Not Working?

If changes still don't reflect:

1. **Check file timestamps** - Ensure source files have recent modification times
2. **Verify .dockerignore** - Make sure source files aren't excluded
3. **Check build context** - Ensure you're building from the correct directory
4. **Inspect image layers** - Use `docker history` to see what was built
5. **Compare file hashes** - Verify dist files match your source

```bash
# Inspect image layers
docker history your-ecr-repo/menulogs-backend:latest

# Compare file contents
docker run --rm your-image:tag cat dist/server.js > /tmp/built.js
diff src/server.ts /tmp/built.js  # Should show compiled differences
```

