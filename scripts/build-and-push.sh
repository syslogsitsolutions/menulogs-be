#!/bin/bash

# Build and Push Script for MenuLogs Backend
# This script ensures fresh builds and proper version tagging

set -e  # Exit on error

# Configuration
ECR_REPOSITORY="${ECR_REPOSITORY:-your-ecr-repo/menulogs-backend}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "dev-$(date +%s)")

# Get version from package.json
PACKAGE_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")

# Version tagging strategy:
# Option 1: Use package.json version (semantic versioning)
# Option 2: Use date-based version (prod-YYYYMMDD-HHMMSS)
# Option 3: Use both

# Default: Use package.json version with build number
# Format: v1.0.0-20241224-abc1234 (version-date-commit)
VERSION_TAG="v${PACKAGE_VERSION}-$(date +%Y%m%d)-${GIT_COMMIT}"

# Also create prod-* tag for ECR lifecycle policy compatibility
PROD_TAG="prod-$(date +%Y%m%d-%H%M%S)"

# Allow override via environment variable
if [ -n "${IMAGE_VERSION}" ]; then
  VERSION_TAG="${IMAGE_VERSION}"
  PROD_TAG="prod-${IMAGE_VERSION}"
fi

echo "🔨 Building Docker image..."
echo "   Repository: ${ECR_REPOSITORY}"
echo "   Package Version: ${PACKAGE_VERSION}"
echo "   Version Tag: ${VERSION_TAG}"
echo "   Prod Tag: ${PROD_TAG}"
echo "   Git Commit: ${GIT_COMMIT}"
echo "   Build Date: ${BUILD_DATE}"
echo ""

# Build with no cache to ensure fresh build
# Remove --no-cache if you want to use cache for faster builds
docker build \
  --no-cache \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  --build-arg BUILD_VERSION="${VERSION_TAG}" \
  --build-arg PACKAGE_VERSION="${PACKAGE_VERSION}" \
  -t "${ECR_REPOSITORY}:${VERSION_TAG}" \
  -t "${ECR_REPOSITORY}:${PROD_TAG}" \
  -t "${ECR_REPOSITORY}:v${PACKAGE_VERSION}" \
  -t "${ECR_REPOSITORY}:latest" \
  .

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "📦 Image tags created:"
echo "   - ${ECR_REPOSITORY}:${VERSION_TAG} (full version)"
echo "   - ${ECR_REPOSITORY}:${PROD_TAG} (prod-* for lifecycle policy)"
echo "   - ${ECR_REPOSITORY}:v${PACKAGE_VERSION} (semantic version)"
echo "   - ${ECR_REPOSITORY}:latest (latest)"
echo ""

# Ask if user wants to push
read -p "Push to ECR? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🚀 Pushing to ECR..."
  
  # Login to ECR (if not already logged in)
  aws ecr get-login-password --region ${AWS_REGION} | \
    docker login --username AWS --password-stdin ${ECR_REPOSITORY%%/*}
  
  # Push all tags
  echo "   Pushing ${ECR_REPOSITORY}:${VERSION_TAG}..."
  docker push "${ECR_REPOSITORY}:${VERSION_TAG}"
  
  echo "   Pushing ${ECR_REPOSITORY}:${PROD_TAG}..."
  docker push "${ECR_REPOSITORY}:${PROD_TAG}"
  
  echo "   Pushing ${ECR_REPOSITORY}:v${PACKAGE_VERSION}..."
  docker push "${ECR_REPOSITORY}:v${PACKAGE_VERSION}"
  
  echo "   Pushing ${ECR_REPOSITORY}:latest..."
  docker push "${ECR_REPOSITORY}:latest"
  
  echo ""
  echo "✅ Successfully pushed to ECR!"
  echo ""
  echo "📝 Deployment Information:"
  echo "   Recommended tag: ${VERSION_TAG}"
  echo "   Or use: ${PROD_TAG}"
  echo "   Or use: v${PACKAGE_VERSION}"
  echo ""
  echo "📝 Next steps:"
  echo "   1. Update your deployment to use: ${VERSION_TAG}"
  echo "   2. Restart your service/container"
  echo "   3. Verify logs show the latest changes"
else
  echo "⏭️  Skipping push. Build completed locally."
fi

