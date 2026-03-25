# Testing SkillForge App

## Dev Server Setup
```bash
npm install
npx prisma generate
npx prisma db push
PORT=3001 npm run dev
```
Server runs on http://localhost:3001

## Database
- SQLite via Prisma at `prisma/dev.db`
- Reset with: `rm prisma/dev.db && npx prisma db push`

## Creating Test Data via API

### Skill Repo
```bash
curl -X POST http://localhost:3001/api/skill-repos \
  -H 'Content-Type: application/json' \
  -d '{"slug":"test-skill","displayName":"Test Skill","description":"For testing"}'
```

### Skill Version (requires `files` array, not `content`)
```bash
curl -X POST http://localhost:3001/api/skill-repos/{repoId}/versions \
  -H 'Content-Type: application/json' \
  -d '{"files":[{"path":"SKILL.md","content":"# Skill content"}],"message":"initial"}'
```

### Eval Suite
```bash
curl -X POST http://localhost:3001/api/eval-suites \
  -H 'Content-Type: application/json' \
  -d '{"skillRepoId":"...","name":"Test Suite","type":"output"}'
```

### Eval Cases (split must be `train`, `validation`, or `holdout` — NOT `test`)
```bash
curl -X POST http://localhost:3001/api/eval-suites/{suiteId}/cases \
  -H 'Content-Type: application/json' \
  -d '{"key":"case-1","name":"Test case","prompt":"...","split":"train"}'
```

### Eval Run (use `mock` executor for quick testing)
```bash
curl -X POST http://localhost:3001/api/eval-runs \
  -H 'Content-Type: application/json' \
  -d '{"skillRepoId":"...","skillVersionId":"...","suiteId":"...","executorType":"mock"}'
# Then start it:
curl -X POST http://localhost:3001/api/eval-runs/{runId}/start
```
Mock executor completes in ~5 seconds.

## Adaptive Language Testing
- Tech level stored in localStorage key: `skillforge-tech-level`
- Valid values: `beginner`, `intermediate`, `expert`
- Set via DevTools console: `localStorage.setItem('skillforge-tech-level', 'beginner')`
- Reload page after changing to see updated terms
- Key terms to verify (must be Title Cased in metric labels):
  - Beginner: "Success Rate", "Score Change", "Original Version", "Test Example"
  - Expert: "Pass Rate", "Delta", "Baseline", "Eval Case"

## Key Pages to Test
- `/wizard` — Interview flow (5 questions: capability, trigger, format, testing, edge_cases)
- `/evals/runs/{id}` — Eval run detail with Outputs tab
- `/evals/runs/{id}/comparison` — Blind comparison with TooltipTerm (visible for beginner/intermediate, hidden for expert)
- `/skill-repos/{id}/improve` — Improvement loop with diff viewer
- `/skill-repos/{id}/trigger-optimizer` — Trigger optimizer with adaptive labels

## Lint & Build
```bash
npm run lint
npm run build
```

## Known Gotchas
- `browser_console` tool may not work if Chrome isn't properly focused — use DevTools console (F12) directly instead
- The version API requires a `files` array (not a `content` string)
- Eval case `split` values are `train`/`validation`/`holdout` (not `test`)
