#!/bin/bash

# Fix Docker Disk Space Issues
# Run this on your EC2 instance

set -e

echo "🔍 Checking disk space and Docker status..."
echo ""

# Check disk space
echo "📊 Disk Usage:"
df -h
echo ""

# Check Docker disk usage
echo "🐳 Docker Disk Usage:"
docker system df
echo ""

# Check inodes
echo "📁 Inode Usage:"
df -i
echo ""

# Check Docker info
echo "ℹ️  Docker Info:"
docker info | grep -E "Docker Root Dir|Data Space|Metadata Space" || true
echo ""

echo "🧹 Cleaning up Docker..."
echo ""

# Prune unused images (not just dangling)
echo "1. Removing unused images..."
docker image prune -a -f --filter "until=24h" || docker image prune -a -f

# Prune containers
echo "2. Removing stopped containers..."
docker container prune -f

# Prune volumes
echo "3. Removing unused volumes..."
docker volume prune -f

# Prune networks
echo "4. Removing unused networks..."
docker network prune -f

# Prune build cache
echo "5. Removing build cache..."
docker builder prune -a -f

# Full system prune (more aggressive)
echo "6. Full system cleanup..."
docker system prune -a -f --volumes || true

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📊 Disk Usage After Cleanup:"
df -h
echo ""
echo "🐳 Docker Disk Usage After Cleanup:"
docker system df
echo ""

# Check if we have enough space now
AVAILABLE=$(df -h / | tail -1 | awk '{print $4}' | sed 's/[^0-9.]//g')
if (( $(echo "$AVAILABLE < 5" | bc -l) )); then
    echo "⚠️  WARNING: Still low on disk space ($AVAILABLE GB available)"
    echo "   Consider:"
    echo "   - Removing old log files"
    echo "   - Expanding EBS volume"
    echo "   - Removing unused Docker images manually"
else
    echo "✅ Sufficient disk space available"
fi

echo ""
echo "💡 Now try pulling again:"
echo "   docker-compose pull"

