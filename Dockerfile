# Use Node.js 20 LTS as base image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json* ./
COPY prisma ./prisma/

# Install dependencies
# Use npm ci if package-lock.json exists, otherwise npm install
RUN if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps; \
    else \
      echo "⚠️ package-lock.json not found, using npm install"; \
      npm install --legacy-peer-deps; \
    fi

# Generate Prisma Client
# Ignore checksum errors for binary downloads (offline/CI environments)
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install OpenSSL and required libraries for Prisma
# Prisma needs libssl.so.1.1 - install openssl and gcompat
# If Prisma still fails, it will use the musl-compatible binary
RUN apk add --no-cache openssl gcompat

WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json* ./
COPY prisma ./prisma/

# Install production dependencies + Prisma CLI (needed for migrations)
# Prisma CLI must match @prisma/client version
# Install locally (not globally) so it works with non-root user
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --legacy-peer-deps && \
      npm install prisma@latest --legacy-peer-deps --save-dev=false; \
    else \
      echo "⚠️ package-lock.json not found, using npm install"; \
      npm install --omit=dev --legacy-peer-deps && \
      npm install prisma@latest --legacy-peer-deps --save-dev=false; \
    fi

# Copy Prisma Client from builder (already generated with correct binary targets)
# The builder stage has the correct binaryTargets in schema.prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/server.js"]



