FROM node:22-slim AS base

# Install git (required for simple-git skill repo management)
RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Ensure public directory exists (Next.js expects it but it may be empty)
RUN mkdir -p public

# Bake NEXT_PUBLIC_* env vars into the Next.js bundle at build time.
# Render injects env vars at runtime only, but Next.js needs them during build.
ENV NEXT_PUBLIC_AGENTATION_ENDPOINT=https://agentation-mcp.onrender.com

# Build Next.js
RUN npm run build

# Production stage
FROM node:22-slim AS production

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built app and dependencies
COPY --from=base /app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/public ./public
COPY --from=base /app/next.config.js ./next.config.js
COPY --from=base /app/seed ./seed
COPY --from=base /app/src ./src
COPY --from=base /app/tsconfig.json ./tsconfig.json

# Create data directory for SQLite and git repos
RUN mkdir -p /data/skill-repos

# Configure git for the container
RUN git config --global user.email "skillforge@localhost" && \
    git config --global user.name "SkillForge" && \
    git config --global init.defaultBranch main

# Ensure node_modules/.bin is on PATH so claude CLI is discoverable
ENV PATH="/app/node_modules/.bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin"
ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/skillforge.db
ENV SKILL_REPOS_PATH=/data/skill-repos
ENV PORT=3000

# Run migrations and start
EXPOSE 3000
CMD echo "Claude CLI: $(which claude 2>&1)" && npx prisma migrate deploy && npm start
