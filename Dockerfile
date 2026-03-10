# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY specs ./specs
RUN npm run build

# Runtime stage
FROM node:22-alpine

# Create non-root user for security
RUN addgroup -g 1000 mcpuser && adduser -D -u 1000 -G mcpuser mcpuser

# Create workspace directory
RUN mkdir -p /tmp/mcp-workspace && \
    chown mcpuser:mcpuser /tmp/mcp-workspace

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/specs ./specs
COPY package.json ./

ENV MCP_SHELL_SPEC_DIR=/app/specs

# Switch to non-root user
USER mcpuser
WORKDIR /tmp/mcp-workspace

ENTRYPOINT ["node", "/app/dist/src/index.js"]
