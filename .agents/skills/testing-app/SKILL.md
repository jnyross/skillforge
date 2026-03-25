# SkillForge Local Testing

## Prerequisites
- Node.js (check with `node -v`)
- ANTHROPIC_API_KEY environment variable set (needed for real LLM calls)

## Database Setup
- SQLite is the default database provider
- Set `DATABASE_URL="file:./dev.db"` before running any Prisma commands
- Generate Prisma client: `npx prisma generate`
- Reset database: `npx prisma db push --force-reset --accept-data-loss`
- Seed database: `npx tsx prisma/seed.ts` (do NOT use `npx prisma db seed` — it requires ts-node which may not be installed; tsx works as a drop-in replacement)
- The seed script creates a default workspace, user, and executor config with `claude-opus-4-6` model

## Starting Dev Server
```bash
export DATABASE_URL="file:./dev.db"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
npm run dev
```
Server starts on http://localhost:3000

## Wizard Testing
- Navigate to http://localhost:3000/wizard
- The page has 4 mode cards: Extract from Task, Synthesize from Artifacts, Hybrid, From Scratch
- **Important**: After the page loads, wait 3-5 seconds before clicking cards — React hydration needs to complete
- Click "From Scratch" to enter the conversational interview flow
- The interview API endpoint is `/api/wizard/interview`
- First message triggers LLM call at `interview-service.ts` line ~273
- Follow-up messages trigger LLM call at `interview-service.ts` line ~520
- Can also test via curl:
  ```bash
  curl -s -X POST http://localhost:3000/api/wizard/interview \
    -H 'Content-Type: application/json' \
    -d '{"action": "start", "mode": "scratch"}'
  ```

## Model Defaults
- The default model across the entire codebase should be `claude-opus-4-6` (1M context window)
- The default executor must always be `claude-cli` (real Claude Code CLI), never `mock`
- Central config is at `src/lib/config.ts`
- Individual services have their own env var overrides (e.g., `SKILL_IMPROVER_MODEL`, `ANALYZER_MODEL`, `TRIGGER_DETECTION_MODEL`)

## Lint & Build
- Lint: `npx next lint`
- Build: `npx next build`
- Both must pass before creating PRs

## Docker Deployment
- `docker-compose.yml` sets `DEFAULT_MODEL` and `DEFAULT_EXECUTOR` environment variables
- Verify these match the expected defaults when deploying
