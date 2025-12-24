#!/bin/bash

# Build and Push Script for MenuLogs Backend
# This script ensures fresh builds and proper image tagging

set -e  # Exit on error

# Configuration
ECR_REPOSITORY="${ECR_REPOSITORY:-your-ecr-repo/menulogs-backend}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
BUILD_VERSION=$(git rev-parse --short HEAD 2>/dev/null || echo "dev-$(date +%s)")

echo "🔨 Building Docker image..."
echo "   Repository: ${ECR_REPOSITORY}"
echo "   Tag: ${IMAGE_TAG}"
echo "   Build Date: ${BUILD_DATE}"
echo "   Build Version: ${BUILD_VERSION}"
echo ""

# Build with no cache to ensure fresh build
# Remove --no-cache if you want to use cache for faster builds
docker build \
  --no-cache \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  --build-arg BUILD_VERSION="${BUILD_VERSION}" \
  -t "${ECR_REPOSITORY}:${IMAGE_TAG}" \
  -t "${ECR_REPOSITORY}:${BUILD_VERSION}" \
  .

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "📦 Image tags:"
echo "   - ${ECR_REPOSITORY}:${IMAGE_TAG}"
echo "   - ${ECR_REPOSITORY}:${BUILD_VERSION}"
echo ""

# Ask if user wants to push
read -p "Push to ECR? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🚀 Pushing to ECR..."
  
  # Login to ECR (if not already logged in)
  aws ecr get-login-password --region ${AWS_REGION} | \
    docker login --username AWS --password-stdin ${ECR_REPOSITORY%%/*}
  
  # Push both tags
  docker push "${ECR_REPOSITORY}:${IMAGE_TAG}"
  docker push "${ECR_REPOSITORY}:${BUILD_VERSION}"
  
  echo ""
  echo "✅ Successfully pushed to ECR!"
  echo ""
  echo "📝 Next steps:"
  echo "   1. Update your deployment to use the new image"
  echo "   2. Restart your service/container"
  echo "   3. Verify logs show the latest changes"
else
  echo "⏭️  Skipping push. Build completed locally."
fi

