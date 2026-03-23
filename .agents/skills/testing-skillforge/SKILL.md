# Testing SkillForge

## Overview
SkillForge is a Next.js 14 app (TypeScript, Tailwind, shadcn/ui, Prisma ORM, SQLite dev DB). Dev server runs on port 3001.

## Setup
```bash
cd /home/ubuntu/repos/skillforge
npm install
npx prisma generate
npx prisma db push
npm run dev  # starts on port 3001
```

## Key Testing Flows

### Eval Runs (Real Claude CLI vs Mock)
- **Default executor**: UI defaults to "Claude CLI" (first option in dropdown). If Claude CLI is not available, fall back to "Mock (Testing)".
- **Real Claude CLI runs** take 2-30+ seconds per case (depending on prompt complexity). Mock runs complete instantly.
- **Distinguishing real vs mock output**:
  - Executor card: "claude-cli" vs "mock"
  - Model: real model name like "claude-sonnet-4-20250514" vs "mock-model"
  - Duration: real runs > 1s, mock runs ~0s
  - Cost: real cost varies (e.g. $0.0043 for simple math, $0.0498 for code gen) vs mock fixed $0.0010
  - Tokens: real token counts with input/output breakdown vs mock fixed values
  - Output: natural language / real code vs mock synthetic pattern text

### Trace Verification
- Navigate to trace detail via eval run → Case Results → "View Trace"
- Check 5 info cards: Duration, Model, Tokens (X in / Y out), Cost, Context
- Output tab shows the actual Claude response text
- "Promote to Regression" button available on trace detail page

### Health Check API
- `GET /api/executor-health` returns JSON with status of each executor
- Expected response: `{"claude-cli":{"ok":true,"version":"X.Y.Z (Claude Code)"},"mock":{"ok":true,"version":"mock-1.0.0"}}`
- If Claude CLI is not installed/authenticated, `claude-cli.ok` will be `false` with error message

### Eval Suite Testing
1. Navigate to `/evals` → click suite → "Add Case" to create test cases
2. For output suites: provide Key, Name, Prompt, Expected Outcome
3. Click "Run Eval" → select version, executor (Claude CLI or Mock), model
4. Run auto-refreshes every 3s until completion
5. Check Case Results tab for pass/fail assertions
6. Check Traces tab for execution details

### Optimizer Testing
- Create optimizer run from `/optimizer` page
- Requires: repo, skill version, at least one eval suite selected
- Uses real Anthropic API for mutations (even when eval executor is mock)
- Candidates appear with mutation type badges and objective scores
- Stop button works mid-run; status correctly shows "stopped" (not "completed")

### Review Arena Testing
- Create review session from `/reviews` page (pass-fail or comparison type)
- Active review UI has keyboard shortcuts (P/F for pass/fail, arrows for navigation, ? for help)
- Critiques capture category, severity, confidence

### Judge Calibration Testing
- Create judge from `/judges` page
- Add prompt versions and validation examples
- Calibration runs use real Anthropic API to evaluate examples
- Judge auto-promotes to "calibrated" at ≥70% agreement with ≥5 examples

## Devin Secrets Needed
- `ANTHROPIC_API_KEY` — needed for judge calibration and optimizer mutations (or use Claude subscription login for CLI executor)

## Common Issues
- If dev server shows old code after a branch merge, restart it (`Ctrl+C` then `npm run dev`)
- Claude CLI may include trailing escape codes in JSON output (e.g. "9;4;0;") — the executor's `extractJson` method handles this
- Eval runs with 2+ cases run sequentially; total duration = sum of individual case durations
- The `--bare` flag on Claude CLI requires `--add-dir` to provide workspace access for skill files
