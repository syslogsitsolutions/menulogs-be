#!/bin/bash

# Script to verify deployment is using the latest image
# Run this on your EC2 instance

echo "🔍 Verifying Deployment"
echo "======================="
echo ""

cd /opt/menulogs/prod || cd /opt/menulogs/dev

# Check current image in docker-compose.yml
echo "📄 Image in docker-compose.yml:"
grep "image:" docker-compose.yml | grep backend || grep "image:" docker-compose.yml
echo ""

# Check what image the container is actually using
echo "🐳 Running container image:"
CONTAINER_ID=$(docker-compose ps -q backend 2>/dev/null)
if [ -n "$CONTAINER_ID" ]; then
  docker inspect $CONTAINER_ID --format='{{.Config.Image}}' 2>/dev/null || echo "Container not running"
else
  echo "Backend container not found"
fi
echo ""

# Check container status
echo "📊 Container status:"
docker-compose ps backend
echo ""

# Check latest image in ECR
echo "📦 Latest images in ECR:"
aws ecr describe-images \
  --repository-name menulogs-backend \
  --region ap-south-1 \
  --query 'sort_by(imageDetails, &imagePushedAt)[-5:].[imageTags[0], imagePushedAt]' \
  --output table 2>/dev/null || echo "Could not query ECR"
echo ""

# Check if .env file exists and has POSTGRES_PASSWORD
echo "🔐 Environment file check:"
if [ -f .env ]; then
  if grep -q "POSTGRES_PASSWORD" .env; then
    echo "✅ POSTGRES_PASSWORD found in .env"
  else
    echo "⚠️  POSTGRES_PASSWORD not found in .env"
  fi
else
  echo "⚠️  .env file not found"
fi
echo ""

# Check container logs for version info
echo "📋 Container logs (showing version info):"
docker-compose logs backend 2>/dev/null | grep -i "version\|build\|connected" | tail -10 || echo "No logs found"
echo ""

echo "✅ Verification complete!"

