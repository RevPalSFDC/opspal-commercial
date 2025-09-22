# HubSpot Bulk Operations Container
FROM node:18-alpine

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    bash \
    curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy bulk toolkit
COPY lib/hubspot-bulk ./lib/hubspot-bulk
COPY bin/ ./bin/

# Copy configuration
COPY .env.template ./.env.template

# Create required directories
RUN mkdir -p \
    /app/tmp/hubspot-bulk \
    /app/.jobs/hubspot \
    /app/out \
    /app/logs/hubspot \
    /app/data

# Set permissions
RUN chmod +x bin/*

# Create non-root user
RUN addgroup -g 1001 -S hubspot && \
    adduser -u 1001 -S hubspot -G hubspot && \
    chown -R hubspot:hubspot /app

USER hubspot

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('./lib/hubspot-bulk').config ? process.exit(0) : process.exit(1)"

# Default environment
ENV NODE_ENV=production \
    HS_LOG_LEVEL=info \
    HS_MAX_CONCURRENT_IMPORTS=5 \
    HS_DELETE_TEMP=true \
    HS_REDACT_PII=true

# Volume mounts
VOLUME ["/app/data", "/app/out", "/app/.jobs"]

# Default command
CMD ["hubspot-monitor", "--follow"]