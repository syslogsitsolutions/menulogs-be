# ============================================
# Builder Stage
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.js ./prisma.config.js

# Install all dependencies (including dev dependencies for build)
RUN if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps; \
    else \
      npm install --legacy-peer-deps; \
    fi

# Generate Prisma Client with correct binary target for Alpine
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN npx prisma generate

# Copy source code
# Use .dockerignore to exclude unnecessary files
COPY . .

# Add build timestamp and version info to force cache invalidation on code changes
ARG BUILD_DATE
ARG BUILD_VERSION
ARG PACKAGE_VERSION
ENV BUILD_DATE=${BUILD_DATE}
ENV BUILD_VERSION=${BUILD_VERSION}
ENV PACKAGE_VERSION=${PACKAGE_VERSION}

# Build TypeScript to JavaScript
# Clean dist folder first to ensure fresh build
RUN rm -rf dist && npm run build

# ============================================
# Production Stage
# ============================================
FROM node:20-alpine AS production

# Install runtime dependencies for Prisma
RUN apk add --no-cache openssl gcompat

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --legacy-peer-deps; \
    else \
      npm install --omit=dev --legacy-peer-deps; \
    fi

# Install Prisma CLI (needed for migrations, but not for generating client)
# Prisma Client is copied from builder stage
# Using --no-save to avoid modifying package.json
RUN npm install prisma@^7.2.0 --legacy-peer-deps --no-save

# Copy Prisma Client from builder (includes generated client and binaries)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.js ./prisma.config.js

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/server.js"]
