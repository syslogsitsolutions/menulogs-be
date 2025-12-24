# Docker Image Versioning Guide

## Overview

This guide explains how to use version numbers with Docker images instead of always using `:latest`.

## Version Tagging Strategy

The build script creates multiple tags for each image:

1. **Full Version Tag**: `v1.0.0-20241224-abc1234`
   - Format: `v{package-version}-{date}-{git-commit}`
   - Most specific, includes all version info
   - Best for production deployments

2. **Prod Tag**: `prod-20241224-143022`
   - Format: `prod-{YYYYMMDD-HHMMSS}`
   - Compatible with ECR lifecycle policy
   - Unique timestamp-based version

3. **Semantic Version**: `v1.0.0`
   - From `package.json` version field
   - Easy to reference specific releases

4. **Latest Tag**: `latest`
   - Always points to most recent build
   - Convenient but not recommended for production

## Usage

### Basic Build (Uses package.json version)

```bash
cd backend
./scripts/build-and-push.sh
```

This will:
- Read version from `package.json` (currently `1.0.0`)
- Create tags: `v1.0.0-20241224-abc1234`, `prod-20241224-143022`, `v1.0.0`, `latest`
- Push all tags to ECR

### Custom Version

```bash
# Set custom version via environment variable
IMAGE_VERSION="v1.2.3" ./scripts/build-and-push.sh

# Or export it first
export IMAGE_VERSION="v1.2.3"
./scripts/build-and-push.sh
```

### Update package.json Version

Before building, update version in `package.json`:

```bash
# Option 1: Manual edit
# Edit package.json and change "version": "1.0.0" to "1.0.1"

# Option 2: Use npm version command
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
```

Then build:
```bash
./scripts/build-and-push.sh
```

## Deployment

### Using Version Tags in Docker Compose

Create or update `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  backend:
    image: your-ecr-repo/menulogs-backend:v1.0.0-20241224-abc1234
    # Or use semantic version:
    # image: your-ecr-repo/menulogs-backend:v1.0.0
    # Or use prod tag:
    # image: your-ecr-repo/menulogs-backend:prod-20241224-143022
    environment:
      - NODE_ENV=production
    # ... other config
```

### Using Version Tags in ECS Task Definition

Update your ECS task definition JSON:

```json
{
  "containerDefinitions": [
    {
      "name": "menulogs-backend",
      "image": "your-ecr-repo/menulogs-backend:v1.0.0-20241224-abc1234",
      ...
    }
  ]
}
```

Or use AWS CLI:

```bash
# Update task definition with new image
aws ecs register-task-definition \
  --family menulogs-backend \
  --container-definitions '[{
    "name": "menulogs-backend",
    "image": "your-ecr-repo/menulogs-backend:v1.0.0-20241224-abc1234",
    ...
  }]'

# Update service to use new task definition
aws ecs update-service \
  --cluster your-cluster \
  --service menulogs-backend-prod \
  --task-definition menulogs-backend:NEW_REVISION
```

## Version Numbering Best Practices

### Semantic Versioning (Recommended)

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR.MINOR.PATCH** (e.g., `1.2.3`)
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

Example workflow:

```bash
# Bug fix release
npm version patch  # 1.0.0 -> 1.0.1
./scripts/build-and-push.sh

# New feature release
npm version minor  # 1.0.1 -> 1.1.0
./scripts/build-and-push.sh

# Breaking change release
npm version major  # 1.1.0 -> 2.0.0
./scripts/build-and-push.sh
```

### Date-Based Versioning

If you prefer date-based versions:

```bash
# Build with date-based version
IMAGE_VERSION="prod-$(date +%Y%m%d-%H%M%S)" ./scripts/build-and-push.sh
```

## Benefits of Versioned Images

1. **Reproducibility**: Deploy exact same version
2. **Rollback**: Easy to rollback to previous version
3. **Tracking**: Know exactly what's deployed
4. **ECR Lifecycle**: Works better with lifecycle policies
5. **Debugging**: Easier to identify which version has issues

## Checking Current Version

### In Running Container

```bash
# Check environment variables
docker exec menulogs-backend-prod env | grep VERSION

# Or check package.json in container
docker exec menulogs-backend-prod cat /app/package.json | grep version
```

### In Application Code

The version is available as environment variables:
- `BUILD_VERSION`: Full version tag
- `PACKAGE_VERSION`: Semantic version from package.json
- `BUILD_DATE`: Build timestamp

You can expose this in your health check endpoint:

```typescript
// In your health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    version: process.env.PACKAGE_VERSION,
    buildVersion: process.env.BUILD_VERSION,
    buildDate: process.env.BUILD_DATE,
    timestamp: new Date().toISOString(),
  });
});
```

## ECR Lifecycle Policy Compatibility

The `prod-*` tags are designed to work with your ECR lifecycle policy:

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 2 tagged images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["prod", "dev", "latest"],
        "countType": "imageCountMoreThan",
        "countNumber": 2
      },
      "action": { "type": "expire" }
    }
  ]
}
```

This will:
- Keep the 2 most recent `prod-*` tagged images
- Keep the 2 most recent `dev-*` tagged images
- Keep the 2 most recent `latest` tagged images
- Delete older images automatically

## Quick Reference

```bash
# Build with current package.json version
./scripts/build-and-push.sh

# Build with custom version
IMAGE_VERSION="v1.2.3" ./scripts/build-and-push.sh

# Update package.json version
npm version patch  # or minor, or major

# Deploy specific version
docker-compose -f docker-compose.prod.yml up -d

# Check what version is running
docker exec menulogs-backend-prod env | grep VERSION
```

## Troubleshooting

### Version not updating

1. Check `package.json` version field
2. Rebuild without cache: `docker build --no-cache ...`
3. Verify tags in ECR: `aws ecr describe-images --repository-name your-repo`

### Deployment using old version

1. Check deployment configuration (docker-compose.yml or ECS task definition)
2. Force pull: `docker-compose pull`
3. Force recreate: `docker-compose up -d --force-recreate`

### Version tag not found in ECR

1. Verify image was pushed: `aws ecr describe-images --repository-name your-repo`
2. Check tag format matches what you're using
3. Ensure you're logged into ECR: `aws ecr get-login-password | docker login ...`

