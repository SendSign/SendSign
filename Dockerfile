# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Build signing UI
COPY signing-ui ./signing-ui
RUN cd signing-ui && npm ci && npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Create non-root user
RUN useradd -r -u 1001 coseal && \
    mkdir -p /app/certs && \
    chown -R coseal:coseal /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=coseal:coseal /app/dist ./dist

# Copy signing UI build
COPY --from=builder --chown=coseal:coseal /app/signing-ui/dist ./signing-ui/dist

# Copy scripts for runtime certificate generation
COPY --from=builder --chown=coseal:coseal /app/scripts ./scripts

# Copy certificates directory (will be populated at runtime or via volume)
# The entrypoint script will generate self-signed certs if none exist

# Switch to non-root user
USER coseal

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Start application
CMD ["node", "dist/index.js"]
