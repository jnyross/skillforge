# SkillForge Development

## Setup

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

- Dev server runs at `http://localhost:3000`
- SQLite database at `./dev.db`
- Skill git repos stored in `./data/skill-repos` (configured via `SKILL_REPOS_PATH` env var)
- Reset DB: `npx prisma db push --force-reset`

## Tech Stack

- Next.js 14.2.x (App Router) — params are synchronous, NOT Promises
- TypeScript, Tailwind CSS, shadcn/ui
- Prisma ORM with SQLite (Postgres-compatible schema)
- simple-git for internal versioning

## Key Commands

- `npm run lint` — ESLint
- `npm run build` — Next.js production build (includes type checking)
- `npx jest` — Unit tests
- `npx prisma studio` — DB GUI

## API Endpoints

- `GET /api/health` — Health check (has Cache-Control: no-store)
- `GET/POST /api/skill-repos` — List/create repos
- `GET/PATCH/DELETE /api/skill-repos/[id]` — Single repo CRUD
- `GET/POST /api/skill-repos/[id]/versions` — List/create versions
- `GET /api/skill-repos/[id]/versions/[versionId]` — Single version
- `POST /api/skill-repos/[id]/lint` — Run linter
- `GET /api/skill-repos/[id]/diff?from=&to=` — Compare versions
- `POST /api/skill-repos/[id]/restore/[versionId]` — Restore version
- `GET /api/skill-repos/[id]/export/[versionId]` — Export version
- `GET/POST /api/skill-repos/[id]/branches` — Branch management

## Security Notes

- All version lookups are scoped by repo ID (cross-repo access returns 404)
- `gitRepoPath` is stripped from all API responses (internal field)
- Path traversal protection on file writes in git-storage
- JSON payload validation on POST endpoints
