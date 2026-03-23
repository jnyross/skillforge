# Testing SkillForge Gap Closure Features

## Overview
This skill covers testing the gap closure features added to SkillForge: wizard methodology alignment, error analysis workflow, judge pipeline, synthetic data generation, and holdout protection.

## Dev Server Setup
- Run `npm run dev -- -p 3001` from the repo root
- If you get MODULE_NOT_FOUND errors, delete `.next/` directory and restart: `rm -rf .next && npm run dev -- -p 3001`
- Database must be migrated: `npx prisma migrate deploy` (or `npx prisma db push`)
- The Anthropic API key must be set as `ANTHROPIC_API_KEY` env var for wizard generation and judge evaluation

## Devin Secrets Needed
- `ANTHROPIC_API_KEY` — Required for wizard skill generation and judge evaluation

## Key Navigation Paths
- **Wizard**: Sidebar → "Wizard" → mode cards (From Scratch, Extract, Synthesize, Hybrid)
- **Error Analysis**: Sidebar → "Error Analysis" → "+ New Session" button
- **Evals (Split Filter)**: Sidebar → "Evals" → click a suite → "Run Eval" button → "Split Filter (Holdout Protection)" dropdown
- **Judges**: Sidebar → "Judges" → judge detail → Prompts/Examples/Calibration tabs

## Critical Test: Wizard Draft Resume Round-Trip
The `resumeDraft` function in `src/app/wizard/page.tsx` has TWO branches:
1. `status === 'review'` — loads generated skill + all intake fields (concreteExamples, freedomLevel, artifacts, config)
2. `else` (intake status) — loads only intake fields

**Both branches must restore concreteExamples and freedomLevel.** This was a recurring bug (fixed 3 times across 3 rounds). Test by:
1. Add concrete examples + set freedom level to Low
2. Generate → Start Over → Drafts → Resume → Back to Edit
3. Verify concrete examples list is populated and freedom level shows Low (not Medium default)

## Error Analysis Session Creation
- Form requires Name + Skill Repo (both required, button disabled without them)
- Sampling strategies: Random, Failure-Driven, Outlier, Stratified
- Created session shows in list with: status badge (active/completed/saturated), name, strategy label, trace/category counts, repo name

## Split Filter (Holdout Protection)
- Located in eval run form ("Run Eval" button on suite detail page)
- 5 options: All splits, Train only, Validation only, Train + Validation (exclude holdout), Holdout only
- Default: All splits
- Help text: 'Use "Train + Validation" for optimizer runs to protect holdout data'

## Common Issues
- `.next` cache can become stale after branch switches — always clean with `rm -rf .next` if you see MODULE_NOT_FOUND errors
- The wizard "From Scratch" card may not respond to clicks if the page hasn't fully loaded — wait for the page to render completely before clicking
- Wizard generation takes ~30s with real Anthropic API
- Synthetic data features have API routes but no dedicated UI dialog — test via API calls
