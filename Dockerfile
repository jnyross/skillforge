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
COPY --from=base /app/next.config.ts ./next.config.ts

# Create data directory for SQLite and git repos
RUN mkdir -p /data/skill-repos

# Configure git for the container
RUN git config --global user.email "skillforge@localhost" && \
    git config --global user.name "SkillForge" && \
    git config --global init.defaultBranch main

ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/skillforge.db
ENV DATA_DIR=/data/skill-repos
ENV PORT=3000

# Run migrations and start
EXPOSE 3000
CMD npx prisma migrate deploy && npm start
