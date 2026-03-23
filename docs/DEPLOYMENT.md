# SkillForge Deployment Guide

SkillForge is a self-hosted application that runs entirely on your local machine or server. No external services are required — all data stays local.

## Quick Start (Docker Compose)

### Prerequisites
- Docker and Docker Compose installed
- (Optional) Anthropic API key for LLM-powered features
- (Optional) Claude Code CLI installed and authenticated for real eval execution

### 1. Clone and configure

```bash
git clone <your-skillforge-repo-url>
cd skillforge
```

Create a `.env` file (optional):
```bash
# Anthropic API key for wizard generation, judge calibration, optimizer mutations
ANTHROPIC_API_KEY=sk-ant-...

# Default executor for eval runs (claude-cli or mock)
DEFAULT_EXECUTOR=claude-cli

# Default model for Claude CLI executor
DEFAULT_MODEL=claude-sonnet-4-20250514

# Port to expose (default: 3000)
PORT=3000
```

### 2. Start with Docker Compose

```bash
docker compose up -d
```

SkillForge will be available at `http://localhost:3000`.

### 3. Load seed examples (optional)

```bash
docker compose exec skillforge npx tsx seed/seed.ts
```

This creates two example skills with eval suites to help you get started.

### 4. Stop

```bash
docker compose down
```

Data is persisted in Docker volumes (`skillforge-data` and `claude-config`).

---

## Development Setup

### Prerequisites
- Node.js 22+
- npm

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

```bash
npx prisma migrate deploy
# or for development:
npx prisma db push
```

### 3. Start the dev server

```bash
npm run dev
```

The app runs at `http://localhost:3000` (or the next available port).

### 4. Load seed data (optional)

```bash
npx tsx seed/seed.ts
```

---

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite database path |
| `SKILL_REPOS_PATH` | `./data/skill-repos` | Directory for git-backed skill repositories |
| `ANTHROPIC_API_KEY` | (none) | API key for Anthropic Claude (wizard, judge, optimizer) |
| `DEFAULT_EXECUTOR` | `claude-cli` | Default executor type for eval runs |
| `DEFAULT_MODEL` | `claude-sonnet-4-20250514` | Default model for Claude CLI |
| `PORT` | `3000` | HTTP port |

---

## Architecture

```
┌──────────────────────────────────────┐
│           Next.js Frontend           │
│  (React, Tailwind, shadcn/ui)        │
├──────────────────────────────────────┤
│          Next.js API Routes          │
│  /api/skill-repos, /api/evals, ...   │
├──────────────────────────────────────┤
│           Service Layer              │
│  git-storage, eval-runner, wizard,   │
│  optimizer, judge, assertions        │
├──────────────────────────────────────┤
│     Prisma ORM + SQLite Database     │
│     simple-git + Local Git Repos     │
└──────────────────────────────────────┘
```

### Key directories

- `src/app/` — Next.js pages and API routes
- `src/lib/services/` — Core business logic
- `prisma/` — Database schema and migrations
- `data/skill-repos/` — Git-backed skill repositories (created at runtime)
- `seed/` — Seed data scripts

---

## Backup and Restore

### Backup

```bash
# Stop the app first
docker compose down

# Backup the database and skill repos
docker run --rm -v skillforge_skillforge-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/skillforge-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore

```bash
# Stop the app
docker compose down

# Restore from backup
docker run --rm -v skillforge_skillforge-data:/data -v $(pwd)/backup:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/skillforge-backup-YYYYMMDD.tar.gz -C /data"

# Start the app
docker compose up -d
```

---

## Troubleshooting

### Database issues
```bash
# Reset the database (WARNING: destroys all data)
npx prisma migrate reset

# View database contents
npx prisma studio
```

### Git repo issues
```bash
# Skill repos are stored in SKILL_REPOS_PATH
ls -la data/skill-repos/

# Each repo is a standard git repo
cd data/skill-repos/<repo-id>
git log --oneline
```

### Claude CLI not working
```bash
# Check Claude CLI is installed
claude --version

# Check authentication
claude -p "hello" --output-format json

# Verify via health check API
curl http://localhost:3000/api/executor-health
```
