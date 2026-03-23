# Testing SkillForge

## Dev Server

- Run `npm run dev` from the repo root. Default port is 3001.
- Dev server URL: `http://localhost:3001`
- Database: SQLite at `./dev.db` (auto-created by Prisma)
- Before testing, ensure `npx prisma db push` has been run if schema changed.

## Navigation

The app uses a sidebar (`nav-sidebar.tsx`) with these routes:
- `/` — Repositories
- `/evals` — Evals
- `/traces` — Trace Lab
- `/reviews` — Review Arena
- `/judges` — Judges
- `/optimizer` — Optimizer
- `/wizard` — Wizard
- `/settings` — Settings

## Testing Review Arena (Phase 3 Slice 8)

### Prerequisites
- At least one skill repo must exist (create via Repositories page first)

### Create Review Session
1. Navigate to `/reviews`
2. Click "New Session" — form fields: Name (required), Skill Repo (select), Type (pass-fail or blind-ab), Reviewer
3. Click "Create Session" — session appears in list with type badge and status

### Active Review (Pass/Fail)
1. Click session → session detail page with Overview/Labels/Comparisons tabs
2. Click "Start Reviewing" → active review page
3. The active review page has:
   - Critique textarea, category input, severity dropdown (minor/major/critical)
   - Confidence slider (default 70%)
   - Pass (P) / Fail (F) buttons
   - Keyboard shortcuts: P=Pass, F=Fail, arrows=navigate, ?=toggle shortcuts
4. After submitting a review, page advances to next item
5. Navigate back to session detail to verify labels are stored

### Notes
- The review page requires eval case run data to display actual outputs. Without prior eval runs, the "Output to Review" section may show placeholder/empty content.
- The blind-ab mode shows side-by-side outputs (Output A / Output B) with vote buttons (A is Better, Tie, B is Better, Both Bad)
- Labels tab on session detail shows stored reviews with pass/fail icon, confidence %, critique text, severity badge, and category

## Testing Judges (Phase 3 Slice 9)

### Create Judge
1. Navigate to `/judges`
2. Click "New Judge" — fields: Name (required), Model (default claude-sonnet), Purpose, Target Criterion, Scope, System Prompt, User Prompt Template
3. Click "Create Judge" — judge appears with "draft" status badge

### Judge Detail Page
- Tabs: Overview, Prompts, Examples, Calibration
- Stats cards: Prompt Versions, Examples (train/val/holdout breakdown), Calibration Runs, Agreement Rate
- Status lifecycle: draft → candidate → calibrated → deprecated
- Uncalibrated warning banner shows when status !== 'calibrated'

### Add Prompt Version (Required for Calibration)
1. Click "Prompts" tab → "Add Version"
2. Fill System Prompt and/or User Prompt Template
3. Click "Add Version" — creates v1 with "active" badge
4. Adding a new version atomically deactivates all previous versions

### Add Validation Examples (Required for Calibration)
1. Click "Examples" tab → "Add Example"
2. Fill Input (required), Expected Label (pass/fail), Split (train/validation/holdout), Human Critique (optional)
3. Need at least 1 validation example to run calibration; need >= 5 for potential "calibrated" status
4. Can also add examples via API: `POST /api/judges/{id}/examples`

### Run Calibration
1. Requires: active prompt version + at least 1 validation example
2. Click "Run Calibration" button (in header or Calibration tab)
3. Calibration runs asynchronously — page auto-polls every 2 seconds
4. After completion, Calibration tab shows:
   - "completed" status badge
   - Confusion matrix (TP/FN/FP/TN grid)
   - 6 metric cards: Precision, Recall, Agreement Rate, TPR (Sensitivity), TNR (Specificity), F1 Score
   - Per-example predictions with correct/incorrect indicators
5. Status auto-updates:
   - Agreement >= 70% AND >= 5 examples → "calibrated" (green)
   - Otherwise → "candidate" (amber)
   - Deprecated judges are never auto-promoted

### Calibration Uses Real Anthropic API
- The calibration service calls the Anthropic API to evaluate each example
- Requires `ANTHROPIC_API_KEY` environment variable to be set
- If API key is missing, calibration will fail with an error

## Devin Secrets Needed

- `ANTHROPIC_API_KEY` — Required for judge calibration (calls Claude API to evaluate examples)

## API Shortcuts for Testing

When adding many examples or comparisons, use the API directly instead of the UI:

```bash
# Add validation example
curl -X POST http://localhost:3001/api/judges/{judgeId}/examples \
  -H 'Content-Type: application/json' \
  -d '{"input":"code to evaluate","expectedLabel":"pass","split":"validation"}'

# Add prompt version
curl -X POST http://localhost:3001/api/judges/{judgeId}/prompt-versions \
  -H 'Content-Type: application/json' \
  -d '{"systemPrompt":"You are a judge...","userPromptTemplate":"Evaluate: {{input}}"}'

# Run calibration
curl -X POST http://localhost:3001/api/judges/{judgeId}/calibrate \
  -H 'Content-Type: application/json' -d '{}'

# Create review session
curl -X POST http://localhost:3001/api/review-sessions \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Session","type":"pass-fail","skillRepoId":"...","reviewer":"tester"}'
```

## Common Issues

- **"No active prompt version found"** when running calibration: Add a prompt version first via the Prompts tab
- **"No validation examples found"** when running calibration: Add examples with split="validation" first
- **Agreement Rate shows "—"**: Calibration may still be running; wait for auto-refresh or manually refresh the page
- **Judge stuck in "draft"**: Run calibration — it auto-promotes to "candidate" if agreement < 70%, or "calibrated" if >= 70%
