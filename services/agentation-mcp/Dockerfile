FROM node:22-slim

# Install agentation-mcp globally
RUN npm install -g agentation-mcp@1.2.0

# Create data directory for SQLite persistence
RUN mkdir -p /data

ENV PORT=10000

EXPOSE 10000

# Run the MCP HTTP server on the Render-assigned port
CMD agentation-mcp server --port ${PORT:-10000}
