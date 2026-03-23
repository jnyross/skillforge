# Testing SkillForge

## Environment Setup

1. Install dependencies: `npm install`
2. Generate Prisma client: `npx prisma generate`
3. Push schema to DB: `npx prisma db push`
4. Start dev server: `npm run dev` (runs on port 3001 by default)
5. Source repo secrets if available: `source /run/repo_secrets/jnyross/skillforge/.env.secrets`

## Devin Secrets Needed

- `ANTHROPIC_API_KEY` — Required for real LLM mutations in the optimizer and judge calibration. Without it, the mutation service falls back to deterministic mock mutations.

## Prerequisites for Testing Features

### Eval Lab (Phase 2)
- Create a skill repo with at least one version containing a SKILL.md file
- Create eval suites (output or trigger type) with at least one case each
- Start an eval run to generate traces

### Review Arena (Phase 3)
- Create a review session (pass-fail or pairwise type)
- Requires eval runs with completed case results to populate review items

### Judge Calibration (Phase 3)
- Create a judge definition
- Add a prompt version (marks as active)
- Add validation examples (at least 5 recommended for calibration)
- Run calibration — requires ANTHROPIC_API_KEY for real evaluation
- Judge auto-promotes to 'calibrated' at >=70% agreement with >=5 examples

### Optimizer (Phase 4)
- Requires: skill repo with versions + eval suites with cases
- The mutation service checks `process.env.ANTHROPIC_API_KEY`:
  - If present: calls Claude API for real LLM-powered mutations
  - If absent or API fails: falls back to deterministic mock mutations
- Mock mutations apply simple transformations (append text, modify description)
- The eval runner uses mock executor by default, so eval results are deterministic
- Candidates are scored with weighted objective function (assertion 35%, regression 20%, trigger 15%, judge 10%, penalties 20%)
- Keep/discard threshold: candidate must show >= 1% improvement over baseline

## Testing Tips

### Optimizer Stop Flow
- The optimizer processes one candidate per iteration (each takes ~8-12 seconds with real API, ~2-3s with mock)
- To test Stop: create a run with high max iterations (e.g., 10) so you have time to click Stop mid-run
- After stopping: verify status shows "stopped" (amber badge), not "completed" or "failed"
- Both Start and Stop buttons should disappear for stopped/completed/failed runs

### Auto-Refresh
- Detail pages auto-refresh every 3 seconds when status is 'running' or 'queued'
- The queued→running transition may take a moment as the job queue picks up the job
- Auto-refresh stops when status changes to completed/stopped/failed

### Form Reset on Repo Switch
- When switching repos in the optimizer create dialog, verify:
  - Suite checkboxes are cleared (no stale selections from previous repo)
  - Version dropdown resets and auto-selects the new repo's first version
  - Suites list updates to show only the new repo's suites

### Common Issues
- If the dev server shows compilation errors after switching branches, restart it
- The `PageNotFoundError` for dynamic routes during hot reload is a known Next.js dev mode issue — it resolves on page refresh
- sqlite3 CLI is not available on the VM; use API endpoints or Prisma to query data
- Budget enforcement: cost is checked at the top of each iteration, so the iteration that exceeds the budget will complete before stopping

## Database
- SQLite at `./dev.db`
- View/modify data via Prisma: `npx prisma studio` or API endpoints
- Git repos stored at `./data/skill-repos/`

## Key API Endpoints
- `GET /api/skill-repos` — list repos
- `GET /api/eval-suites` — list suites
- `GET /api/optimizer-runs` — list optimizer runs
- `POST /api/optimizer-runs` — create optimizer run
- `POST /api/optimizer-runs/:id/start` — start run
- `POST /api/optimizer-runs/:id/stop` — stop run
- `POST /api/optimizer-runs/:id/promote/:candidateId` — promote candidate
