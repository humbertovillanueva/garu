# Garu sandbox image: a small Node runtime with the common MCP tool servers
# preinstalled, so agents can run with --network none and still have tools.
#
#   garu sandbox build          # builds this as "garu-sandbox"
#
# Add your own servers below and rebuild. Keep it slim: every agent's tool
# servers start from this image on every run.
FROM node:22-slim

RUN npm install -g --no-audit --no-fund \
      @modelcontextprotocol/server-filesystem \
      @modelcontextprotocol/server-memory \
    && npm cache clean --force

# Drop to the unprivileged user that the node image ships with.
USER node
WORKDIR /workspace
