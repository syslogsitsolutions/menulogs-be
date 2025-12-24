# When to Use build-and-push.sh Script

## Current Setup

You have **two ways** to build and deploy:

1. **GitHub Actions CI/CD** (`.github/workflows/deploy.yml`) - Automated
2. **build-and-push.sh script** - Manual/Local

## When to Use build-and-push.sh Script

### ✅ Use the Script For:

1. **Local Testing Before CI/CD**
   ```bash
   # Test build locally before pushing to GitHub
   ./scripts/build-and-push.sh
   ```

2. **Manual/Hotfix Deployments**
   - Quick fixes that need immediate deployment
   - Emergency deployments outside normal CI/CD flow
   - Testing new build configurations

3. **Development/Staging Testing**
   ```bash
   # Build and test locally
   IMAGE_VERSION="dev-test" ./scripts/build-and-push.sh
   ```

4. **Debugging Build Issues**
   - When CI/CD fails and you need to debug locally
   - Testing Dockerfile changes
   - Verifying build arguments

5. **One-off Builds**
   - Building specific versions
   - Creating test images
   - Building for different environments

### ❌ Don't Use the Script For:

1. **Regular Production Deployments** - Use CI/CD instead
2. **Automated Workflows** - CI/CD handles this
3. **Team Deployments** - CI/CD ensures consistency

## Current CI/CD vs Script Comparison

### Your Current CI/CD (deploy.yml)

**What it does:**
- ✅ Builds on push to `main` or `develop`
- ✅ Tags as `prod` or `dev`
- ✅ Pushes to ECR
- ✅ Deploys to EC2 automatically
- ✅ Runs migrations
- ✅ Health checks

**Limitations:**
- ❌ Only tags as `prod` or `dev` (not versioned)
- ❌ No semantic versioning
- ❌ No build metadata (date, commit)
- ❌ Can't easily rollback to specific version

### build-and-push.sh Script

**What it does:**
- ✅ Creates multiple version tags
- ✅ Includes semantic versioning from package.json
- ✅ Adds build metadata (date, commit hash)
- ✅ Creates `prod-*` tags for lifecycle policy
- ✅ More flexible for manual builds

**Limitations:**
- ❌ Manual process (not automated)
- ❌ Doesn't deploy automatically
- ❌ Requires manual ECR login

## Recommendation: Use Both!

### Option 1: Keep Script for Local Testing (Recommended)

Use the script for local testing, but **integrate versioning into CI/CD**:

**Update your CI/CD to use versioning:**

```yaml
# In deploy.yml, replace the build step:
- name: Build, tag, and push image to Amazon ECR
  id: build-image
  env:
    ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
    PACKAGE_VERSION: ${{ fromJSON(github.event.head_commit.message).version || '1.0.0' }}
  run: |
    # Get version from package.json
    PACKAGE_VERSION=$(node -p "require('./package.json').version")
    GIT_COMMIT=$(echo ${{ github.sha }} | cut -c1-7)
    BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    VERSION_TAG="v${PACKAGE_VERSION}-$(date +%Y%m%d)-${GIT_COMMIT}"
    PROD_TAG="prod-$(date +%Y%m%d-%H%M%S)"
    
    # Build with version tags
    docker build \
      --build-arg BUILD_DATE="${BUILD_DATE}" \
      --build-arg BUILD_VERSION="${VERSION_TAG}" \
      --build-arg PACKAGE_VERSION="${PACKAGE_VERSION}" \
      -t $ECR_REGISTRY/$ECR_REPOSITORY:${VERSION_TAG} \
      -t $ECR_REGISTRY/$ECR_REPOSITORY:${PROD_TAG} \
      -t $ECR_REGISTRY/$ECR_REPOSITORY:${{ env.IMAGE_TAG }} \
      -t $ECR_REGISTRY/$ECR_REPOSITORY:latest \
      .
    
    # Push all tags
    docker push $ECR_REGISTRY/$ECR_REPOSITORY:${VERSION_TAG}
    docker push $ECR_REGISTRY/$ECR_REPOSITORY:${PROD_TAG}
    docker push $ECR_REGISTRY/$ECR_REPOSITORY:${{ env.IMAGE_TAG }}
    docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
    
    echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:${VERSION_TAG}" >> $GITHUB_OUTPUT
    echo "version_tag=${VERSION_TAG}" >> $GITHUB_OUTPUT
```

### Option 2: Use Script Logic in CI/CD

Extract the versioning logic and use it in both places:

**Create a version helper script:**

```bash
# scripts/get-version.sh
#!/bin/bash
PACKAGE_VERSION=$(node -p "require('./package.json').version")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

VERSION_TAG="v${PACKAGE_VERSION}-$(date +%Y%m%d)-${GIT_COMMIT}"
PROD_TAG="prod-$(date +%Y%m%d-%H%M%S)"

echo "PACKAGE_VERSION=${PACKAGE_VERSION}"
echo "VERSION_TAG=${VERSION_TAG}"
echo "PROD_TAG=${PROD_TAG}"
echo "BUILD_DATE=${BUILD_DATE}"
echo "GIT_COMMIT=${GIT_COMMIT}"
```

Then use it in both:
- `build-and-push.sh` - sources the script
- `deploy.yml` - runs the script and uses outputs

## Best Practice Workflow

### For Regular Deployments:
1. **Make changes** → Commit → Push to `main`
2. **CI/CD automatically** builds, tags, and deploys
3. **No manual script needed**

### For Testing/Debugging:
1. **Test locally** with `./scripts/build-and-push.sh`
2. **Verify build works**
3. **Then push** to trigger CI/CD

### For Hotfixes:
1. **Use script** for quick manual build: `IMAGE_VERSION="hotfix-1" ./scripts/build-and-push.sh`
2. **Deploy manually** to EC2
3. **Or push to GitHub** to trigger CI/CD

## Summary

**You don't need the script for regular deployments** - your CI/CD handles that.

**Use the script for:**
- ✅ Local testing
- ✅ Debugging build issues
- ✅ Manual/hotfix deployments
- ✅ Development workflow

**Better approach:** Integrate the versioning logic from the script into your CI/CD so you get versioned tags automatically, and keep the script for local testing.

