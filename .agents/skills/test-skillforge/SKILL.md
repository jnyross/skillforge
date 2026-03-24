---
name: test-skillforge
description: Set up and test SkillForge locally — start dev server, reset database, seed data, and verify UI flows through the browser.
---

## Setup

1. Install dependencies: `npm install`
2. Generate Prisma client: `npx prisma generate`
3. Delete stale build cache: `rm -rf .next`
4. Reset the database: `npx prisma db push --force-reset`
5. Seed with sample data: `npx prisma db seed`
6. Start the dev server: `npm run dev`
7. Wait for "Ready on http://localhost:3000" (may fall back to port 3001 if 3000 is in use)

## Verify

1. Read the git diff to identify which pages and APIs changed
2. Open each affected page in the browser and verify it loads without errors
3. Test the relevant UI flows from this list:
   - **Home page** (`/`): Repo cards render with badges (Clean, Champion, version count)
   - **Repo detail** (`/skill-repos/[id]`): Version list, file viewer, tags, lint, linked eval runs
   - **Eval suites** (`/evals`): Create suite, add cases, start run with `mock` executor, verify results
   - **Trace Lab** (`/traces`): Trace list with filters, detail page with Duration/Model/Tokens/Cost/Context cards
   - **Review Arena** (`/reviews`): Create session, pass-fail review with critique, keyboard shortcuts (P/F)
   - **Judge Calibration** (`/judges`): Create judge, add prompt versions, run calibration
   - **Optimizer** (`/optimizer`): Create run, verify candidates, start/stop, promotion
   - **Wizard** (`/wizard`): From Scratch flow — intake form, generate (needs ANTHROPIC_API_KEY), review, save
   - **Settings** (`/settings`): 3 execution modes with `--permission-mode` flags, executor CRUD
   - **Audit Log** (`/audit-log`): Heading, filters (action/entity/actor), pagination
   - **Synthetic Data** (`/synthetic-data`): Config list, dimension management
   - **Error Analysis** (`/error-analysis`): Error pattern list
4. Check the browser console for errors on each page

## Before Opening the PR

1. Run `npm run lint` and fix any issues
2. Run `npm run build` — this catches TypeScript type errors
3. Run `npm run test` — pre-existing `git-storage.test.ts` failures ("branch already exists") are acceptable
4. Include screenshots of tested pages in the PR description

## Known Quirks

- If the dev server shows old code after switching branches, delete `.next/` and restart
- YAML frontmatter `---` delimiters in SKILL.md should render as plain text, NOT as diff-colored lines
- The wizard "From Scratch" card may not respond to clicks if the page hasn't fully loaded — wait for render
- `ANTHROPIC_API_KEY` is required for wizard generation, judge calibration, and optimizer mutations (saved in Devin secrets)
- Claude Code CLI is authenticated via subscription — use `claude-cli` executor for real evals, `mock` for fast tests
- Database is SQLite at `./dev.db` by default
