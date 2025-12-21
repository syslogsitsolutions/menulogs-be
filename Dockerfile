# ============================================
# Builder Stage
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

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
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

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
RUN npm install prisma@^6.1.0 --legacy-peer-deps --no-save

# Copy Prisma Client from builder (includes generated client and binaries)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

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
