# SkillForge PRD Implementation Progress

**Last updated:** 2026-03-23

---

## Overview

The PRD defines **5 phases** and **13 implementation slices** (Slice 0-12). The current codebase implements portions of **Phase 1** (Slices 0-3), with significant gaps even within those slices. Phases 2-5 (Slices 4-12) are entirely unimplemented.

---

## Phase 1 — Real MVP

### Slice 0 — Scaffold
**Status: Mostly Done**

| Requirement | Status | Notes |
|---|---|---|
| Monorepo | Done | Next.js 14 + TypeScript single app |
| App shell | Done | Layout, sidebar, routing |
| PostgreSQL | **Not done** | Using SQLite instead (PRD specifies Postgres) |
| Redis + BullMQ | **Not done** | No queue/worker infrastructure |
| Local blob storage | Partial | Git repos stored on local filesystem |
| CI | Done | GitHub Actions: lint, build, test on push/PR |
| Lint/format/test commands | Done | ESLint, Vitest configured |
| GitHub repo initialized | Done | Repo exists with commits |
| Health endpoint test | Done | `GET /api/health` |
| DB migration smoke test | Done | Prisma migrations set up (`prisma migrate dev`) |
| Queue smoke test | **Not done** | No queue system |

### Slice 1 — Skill Parser and Validator
**Status: Mostly Done**

| Requirement | Status | Notes |
|---|---|---|
| File upload/import | Done | Import from zip, JSON files, local folder, and git URL via `POST /api/skill-repos/:id/import` and `POST /api/skill-repos/:id/import-git` |
| SKILL.md parser | Done | `skill-parser.ts` with gray-matter |
| Frontmatter validation | Done | name, description, YAML parsing |
| Spec compliance checks | Done | Hard validation layer |
| Best-practice warning engine v1 | Done | Strong warnings + advisory recommendations |
| Tests: valid/invalid names | Done | Unit tests exist |
| Tests: description length | Done | |
| Tests: malformed YAML | Done | |
| Tests: directory mismatch | Partial | Name format checked, not full directory match |
| Tests: generic warning detection | Done | |
| Tests: oversized body detection | Done | |

### Slice 2 — Internal Git-backed Repository
**Status: Mostly Done**

| Requirement | Status | Notes |
|---|---|---|
| Create repo | Done | `initSkillGitRepo()` |
| Save version | Done | `createVersion()` with commit |
| Diff versions | Done | `diffVersions()` with per-file hunks |
| Restore version | Done | `restoreVersion()` creates new commit |
| Branch support | Done | `createBranch()`, `listBranches()` |
| Tests: commit creation | Done | Integration tests in `git-storage.test.ts` |
| Tests: file tree round-trip | Done | Tests writeFiles/readFiles round-trip |
| Tests: diff correctness | Done | Tests diffVersions with add/modify/remove |
| Tests: restore correctness | Done | Tests restoreVersion restores old content |
| Tests: concurrent save protection | Done | Optimistic locking via `expectedParentVersionId` on version creation (409 on conflict) |

### Slice 3 — Repository UI
**Status: Mostly Done**

| Requirement | Status | Notes |
|---|---|---|
| Repo list | Done | Home page with cards |
| Version list | Done | Left sidebar in repo detail with tag badges |
| Diff viewer | Done | Compare versions tab |
| Save/restore flows | Done | New version dialog, restore button |
| Tests: Playwright CRUD | **Not done** | No E2E tests |
| Tests: diff rendering | **Not done** | |
| Tests: rollback flow | **Not done** | |

### Phase 1 PRD items still missing (not in slices):

| Requirement | Status | Notes |
|---|---|---|
| Skill import/export (zip, folder, git URL) | Done | Import (zip, folder, JSON, git URL) + export (JSON, zip) all implemented |
| Manual run harness against real Claude Code CLI | **Not done** | |
| Smoke eval support | **Not done** | |
| Semantic labels/tags on versions | Done | `VersionTag` model + CRUD API + UI for add/remove tags |
| Author field on versions | Done | Configurable `author` field on version creation (defaults to "user") |
| Lint-by-version endpoint | Done | `GET /api/skill-repos/:id/lint/:versionId` with summary stats |
| Associated files (references/, scripts/, assets/, evals/) | Partial | Can store arbitrary files but no specialized handling |

---

## Phase 2 — Eval Lab (Slices 4-7)
**Status: Not Started**

### Slice 4 — Real Claude CLI Smoke Executor
- [ ] Executor adapter interface
- [ ] CLI runner (`ClaudeCliExecutor`)
- [ ] Temp workspace materializer
- [ ] Artifact capture
- [ ] Trace persistence
- [ ] All tests

### Slice 5 — Trigger Evals
- [ ] Trigger suite CRUD
- [ ] Repeated trigger runs
- [ ] Metric computation (precision, recall, F1, etc.)
- [ ] Description comparison screen
- [ ] All tests

### Slice 6 — Output/Workflow Evals
- [ ] Eval case CRUD
- [ ] Baseline vs candidate runs
- [ ] Assertion engine (code, LLM-judged, human)
- [ ] Benchmark summaries
- [ ] All tests

### Slice 7 — Trace Lab
- [ ] Trace browser
- [ ] Artifact viewer
- [ ] Failure clustering v1
- [ ] Promote trace to regression
- [ ] All tests

---

## Phase 3 — Human Review + Judge Calibration (Slices 8-9)
**Status: Not Started**

### Slice 8 — Human Review Arena
- [ ] Blind A/B review UI
- [ ] Pass/fail review
- [ ] Critique storage
- [ ] Keyboard shortcuts, progress UX
- [ ] All tests

### Slice 9 — Judge Calibration
- [ ] Judge prompt objects
- [ ] Calibration jobs
- [ ] Confusion matrix metrics
- [ ] Judge status lifecycle
- [ ] All tests

---

## Phase 4 — AutoResearch / Optimizer (Slice 10)
**Status: Not Started**

### Slice 10 — Optimizer
- [ ] Bounded candidate loop
- [ ] Mutation operators v1
- [ ] Train/validation/holdout discipline
- [ ] Keep/discard/crash logs
- [ ] Promotion gating
- [ ] All tests

---

## Phase 5 — Skill Creation Wizard (Slice 11)
**Status: Not Started**

### Slice 11 — Wizard
- [ ] Intent + artifact intake
- [ ] Initial skill generation
- [ ] Initial eval generation
- [ ] Smoke benchmark
- [ ] Save draft as version
- [ ] All tests

---

## Hardening (Slice 12)
**Status: Not Started**

### Slice 12 — Hardening and Acceptance
- [ ] Full docs
- [ ] Deployment scripts (Docker Compose)
- [ ] Self-hosted GitHub Actions runner docs
- [ ] Seed examples
- [ ] Acceptance dashboard
- [ ] Full E2E acceptance tests

---

## Data Model Coverage

| PRD Entity | Implemented | Notes |
|---|---|---|
| `workspace` | No | |
| `user` | No | |
| `skill_repo` | Yes | As `SkillRepo` Prisma model |
| `skill_branch` | Partial | Branch name on version, no dedicated model |
| `skill_version` | Yes | As `SkillVersion` Prisma model |
| `skill_file` | No | Files stored in git, not DB |
| `version_tag` | Yes | As `VersionTag` Prisma model for semantic labels |
| `git_import_log` | Yes | As `GitImportLog` Prisma model for tracking git imports |
| `artifact_blob` | No | |
| `eval_suite` | No | |
| `eval_case` | No | |
| `eval_case_fixture` | No | |
| `eval_run` | No | |
| `eval_case_run` | No | |
| `assertion_result` | No | |
| `benchmark_snapshot` | No | |
| `review_session` | No | |
| `review_label` | No | |
| `pairwise_comparison` | No | |
| `preference_vote` | No | |
| `critique` | No | |
| `judge_definition` | No | |
| `judge_prompt_version` | No | |
| `judge_calibration_run` | No | |
| `judge_example` | No | |
| `optimizer_run` | No | |
| `optimizer_candidate` | No | |
| `optimizer_mutation` | No | |
| `optimizer_decision` | No | |
| `trace` | No | |
| `tool_event` | No | |
| `run_artifact` | No | |
| `log_chunk` | No | |
| `LintResult` | Yes | (Not in PRD data model but implemented) |

---

## API Coverage

| PRD Endpoint | Implemented | Notes |
|---|---|---|
| `POST /api/skill-repos` | Yes | |
| `GET /api/skill-repos` | Yes | |
| `GET /api/skill-repos/:id` | Yes | |
| `PATCH /api/skill-repos/:id` | Yes | (extra, not in PRD) |
| `DELETE /api/skill-repos/:id` | Yes | (extra, not in PRD) |
| `POST /api/skill-repos/:id/import` | Yes | Supports zip, JSON files, folder path |
| `POST /api/skill-repos/:id/import-git` | Yes | Clone from git URL with optional branch/subfolder |
| `POST /api/skill-repos/:id/export` | Yes | Export by version as JSON or zip (`?format=zip`) |
| `POST /api/skill-repos/:id/versions` | Yes | With author, tags, optimistic locking support |
| `GET /api/skill-repos/:id/versions/:versionId` | Yes | Includes tags in response |
| `GET /api/skill-repos/:id/versions/:versionId/tags` | Yes | List tags for a version |
| `POST /api/skill-repos/:id/versions/:versionId/tags` | Yes | Add tag to a version |
| `DELETE /api/skill-repos/:id/versions/:versionId/tags` | Yes | Remove tag from a version |
| `GET /api/skill-repos/:id/diff` | Yes | |
| `POST /api/skill-repos/:id/restore/:versionId` | Yes | |
| `POST /api/skill-repos/:id/lint` | Yes | |
| `GET /api/skill-repos/:id/lint/:versionId` | Yes | With summary stats (error/warning/info counts) |
| `GET /api/skill-repos/:id/branches` | Yes | |
| `POST /api/skill-repos/:id/branches` | Yes | |
| `POST /api/eval-suites` | No | |
| `POST /api/eval-suites/:id/cases` | No | |
| `POST /api/eval-runs` | No | |
| `GET /api/eval-runs/:id` | No | |
| `GET /api/eval-runs/:id/traces` | No | |
| `POST /api/eval-runs/:id/promote-failures-to-regression` | No | |
| `POST /api/review-sessions` | No | |
| `POST /api/review-sessions/:id/labels` | No | |
| `POST /api/review-sessions/:id/votes` | No | |
| `POST /api/judges` | No | |
| `POST /api/judges/:id/calibrate` | No | |
| `GET /api/judges/:id` | No | |
| `POST /api/optimizer-runs` | No | |
| `GET /api/optimizer-runs/:id` | No | |
| `POST /api/optimizer-runs/:id/stop` | No | |
| `POST /api/optimizer-runs/:id/promote-candidate/:candidateId` | No | |
| `POST /api/wizard/draft` | No | |
| `POST /api/wizard/draft/:id/generate` | No | |
| `POST /api/wizard/draft/:id/save` | No | |

---

## UI Coverage

| PRD Screen | Implemented | Notes |
|---|---|---|
| Main navigation sidebar | Yes | With disabled placeholders for future sections |
| Repository list screen | Yes | With lint status badges |
| Version detail screen | Mostly Done | Overview (with author, tags), files, scorecard, lint, diff tabs; import/export; missing linked evals/reviews/optimizer |
| Eval run screen | No | |
| Review arena | No | |
| Optimizer screen | No | |
| Wizard screen | No | |
| Settings / Executors | No | |

---

## Summary Estimate

| Phase | Slices | Status | Completion |
|---|---|---|---|
| Phase 1 — Real MVP | 0-3 | Mostly done | ~88% |
| Phase 2 — Eval Lab | 4-7 | Not started | 0% |
| Phase 3 — Human Review + Judge | 8-9 | Not started | 0% |
| Phase 4 — Optimizer | 10 | Not started | 0% |
| Phase 5 — Wizard | 11 | Not started | 0% |
| Hardening | 12 | Not started | 0% |
| **Overall** | **0-12** | | **~18-20%** |

Key remaining gaps in Phase 1:
- No Postgres (using SQLite)
- No Redis/BullMQ worker infrastructure
- No E2E/Playwright tests
- No Claude CLI execution harness
- No smoke eval support
