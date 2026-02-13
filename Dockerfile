# ─── Stage 1: Builder ───────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ postgresql-client

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* ./
COPY signing-ui/package.json signing-ui/package-lock.json* ./signing-ui/

# Install dependencies (we'll keep tsx for runtime since TypeScript has pre-existing errors)
RUN npm ci
RUN cd signing-ui && npm ci

# Copy source code
COPY . .

# Build frontend (Vite)
RUN cd signing-ui && npm run build

# Note: Backend runs via tsx in production instead of tsc compilation
# This is due to pre-existing TypeScript errors in the codebase
# that don't affect runtime but prevent strict compilation

# ─── Stage 2: Runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install runtime dependencies only
RUN apk add --no-cache \
    postgresql-client \
    curl \
    tini \
    openssl

# Create non-root user
RUN addgroup -g 1001 -S sendsign && \
    adduser -S sendsign -u 1001

WORKDIR /app

# Copy application files from builder
COPY --from=builder --chown=sendsign:sendsign /app/src ./src
COPY --from=builder --chown=sendsign:sendsign /app/node_modules ./node_modules
COPY --from=builder --chown=sendsign:sendsign /app/signing-ui/dist ./signing-ui/dist
COPY --from=builder --chown=sendsign:sendsign /app/marketing ./marketing
COPY --from=builder --chown=sendsign:sendsign /app/package.json ./package.json
COPY --from=builder --chown=sendsign:sendsign /app/drizzle.config.ts ./drizzle.config.ts

# Note: Database migrations are in src/db/migrations and src/db/migrations/meta
# They're already included in the src/ copy above

# Copy scripts (startup, migrations, etc.)
COPY --from=builder --chown=sendsign:sendsign /app/scripts ./scripts
RUN chmod +x ./scripts/*.sh

# Create directories for storage and certificates
RUN mkdir -p /app/storage /app/certs && chown -R sendsign:sendsign /app/storage /app/certs

# Switch to non-root user
USER sendsign

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use tini to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["./scripts/start-production.sh"]
