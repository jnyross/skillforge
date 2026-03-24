# Testing SkillForge

## Prerequisites

- Node.js 18+ and npm installed
- Claude Code CLI installed and authenticated (`claude --version` to verify)
- Anthropic API key set as `ANTHROPIC_API_KEY` environment variable (needed for wizard generation, eval builder chat, synthetic data, judge calibration)

## Devin Secrets Needed

- `ANTHROPIC_API_KEY` — Anthropic API key for SDK-based features (wizard, eval builder, synthetic data, judges)
- Claude CLI authentication — handled via user subscription login (`claude` command must be on PATH)

## Starting the Dev Server

```bash
cd /home/ubuntu/repos/skillforge
npx prisma migrate deploy   # ensure DB schema is up to date
npm run dev                  # starts on port 3000 (or 3001 if 3000 is busy)
```

## Test Data Setup

Before testing eval runs, you need:
1. A skill repo: `POST /api/skill-repos` with `{"displayName": "...", "slug": "..."}`
2. A version: `POST /api/skill-repos/:id/versions` with `{"message": "...", "files": [{"path": "SKILL.md", "content": "..."}]}`
3. An eval suite: `POST /api/eval-suites` with `{"name": "...", "type": "output", "skillRepoId": "..."}`
4. An eval case: `POST /api/eval-suites/:id/cases` with `{"key": "...", "name": "...", "prompt": "...", "expectedOutcome": "...", "split": "train"}`

Alternatively, the Wizard flow creates all of this automatically.

## Key Testing Flows

### 1. Eval Run with Claude CLI

- Navigate to `/evals`, click a suite, click "Run Eval"
- **Verify**: Executor dropdown defaults to "Claude CLI" (not "Mock")
- **Verify**: Model dropdown defaults to "Claude Opus 4.6"
- Select a version and click "Start Run"
- Wait for completion (real CLI calls take 5-60s per case)
- Click on the completed run to view details
- **Verify**: `executorType` shows `claude-cli`, `model` shows `claude-opus-4-6`
- Click on traces to verify model name from CLI output
- **Key signal**: Duration >5s confirms real CLI (mock is <100ms)

### 2. Wizard Skill Generation + Smoke Test

- Navigate to `/wizard`, select "From Scratch"
- Fill intent and at least one concrete example
- Click "Generate Skill" — takes ~30-60s for real Anthropic API call
- **Verify**: Generated SKILL.md has real content with frontmatter
- Save the skill, then click "Run Smoke Eval"
- **Verify**: Smoke test uses `claude-cli` executor (shown in description text)
- Wait up to 3 minutes for completion (timeout was increased from 60s to 180s)
- **Verify**: Smoke test shows completion status with pass rate

### 3. Eval Builder Chat

- Navigate to `/eval-builder`, click "New Conversation"
- Send a message describing what evals to create
- **Verify**: Response takes ~10-20s (real Anthropic API, not instant mock)
- **Verify**: Response is contextual and intelligent (not generic placeholder)

### 4. Settings Page

- Navigate to `/settings`
- **Verify**: Executor type defaults to "Claude CLI" in the add executor form

## Common Issues

- **Port 3000 in use**: Dev server will auto-fallback to 3001. Check terminal output.
- **Smoke test timeout**: If Claude CLI is slow (>3 min for all cases), the smoke test may show "error" status. The timeout is 90 polls x 2s = 180s.
- **Trigger eval pass rate**: Trigger suites test whether Claude's response "triggers" — low pass rates (25-50%) are normal for trigger detection.
- **Pre-existing test failures**: `git-storage.test.ts` has 5-6 known flaky tests due to test isolation issues. These are unrelated to executor/model changes.
- **Database migration**: If you see errors about missing tables, run `npx prisma migrate deploy` before starting the server.

## Architecture Notes

- **Executor selection**: `createExecutor(type)` in `src/lib/services/executor/index.ts` maps `'claude-cli'` → `ClaudeCliExecutor`, `'mock'` → `MockExecutor`
- **Model configuration**: Default model is set in `src/lib/config.ts` (`defaultModel`). Individual services may override this.
- **Job queue**: Eval runs use an in-process job queue (`src/lib/services/job-queue.ts`). Jobs are processed inline via `setImmediate()`.
- **Trace model field**: Populated from Claude CLI's `modelUsage` keys in the JSON output — this is the most reliable way to verify which model was actually used.
