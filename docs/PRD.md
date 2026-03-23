# PRD — SkillForge
## Git-backed repository, eval lab, blind arena, and auto-optimizer for Claude Code Skills

**Status:** Build-ready PRD  
**Audience:** Coding agent, technical founder/PM, full-stack engineer  
**Primary user:** Power user or small team authoring Claude Code skills  
**Date:** 2026-03-20  
**Working name:** SkillForge

---

## 1. Executive summary

Build a self-hosted web application that acts as a GitHub-like repository and improvement system for Claude Code skills.

The product must do five things well:

1. **Store and version skills** as first-class repositories, including `SKILL.md` and all associated files.
2. **Evaluate skills against real Claude Code behavior**, not simulated prompts.
3. **Compare versions with both machine and human judgment**, including blind A/B testing and preference capture.
4. **Improve skills automatically** using a Karpathy-style evaluator-optimizer loop, but only against frozen, trustworthy evals.
5. **Help users create new skills from scratch** by turning real intent, artifacts, examples, and corrections into an initial skill plus an eval suite.

The system must be opinionated:
- It uses **real Claude Code CLI runs** as the source of truth for promotion decisions.
- It stores every skill as an **internal Git repository** so version history, diffs, branches, rollbacks, and experiment lineage are native.
- It treats **human judgments as gold**, **code assertions as the most reliable automated checks**, and **LLM-as-a-judge as a calibrated helper**, not an oracle.
- It keeps **training evals, validation evals, and holdout evals separate** so the optimizer cannot overfit and “win” by gaming the benchmark.
- It defaults to **sandboxed execution and human approval for promotion**.

This PRD is intentionally written so a coding agent can build the system in one repo, in thin vertical slices, with TDD and frequent commits.

---

## 2. Problem statement

Claude Code skills are currently managed in ad hoc folders, copied between machines, and improved manually. That breaks down quickly:

- there is no reliable repository of skills and versions
- associated files (`references/`, `scripts/`, `assets/`, fixtures, notes) drift away from `SKILL.md`
- improvements are judged by “vibes” instead of reproducible evals
- triggering quality is rarely measured explicitly
- blind human preference data is usually missing
- LLM judges are often used before they are calibrated
- iterative optimization often overfits because the system edits both the skill and the benchmark
- real Claude Code behavior differs from toy prompt-only evaluation

The user needs one system that closes the loop:

**author → version → evaluate → inspect traces → blind review → calibrate judges → optimize → promote**

---

## 3. Product vision

SkillForge should become the canonical place where a user:

- stores every Claude Code skill they care about
- sees exactly what changed between versions
- knows whether a new version is actually better
- can run side-by-side comparisons against baselines
- can collect human preference data without anchoring bias
- can launch automatic hill-climbing runs that propose and test better skill variants
- can create a brand new skill from real artifacts and real usage examples instead of generic prompt sludge

---

## 4. Research-backed product principles

These principles are mandatory design constraints.

### 4.1 Skills are package-like folders, not single prompts
A skill is a folder centered on `SKILL.md`, plus optional scripts, references, assets, and other files. The product must treat the entire folder as the versioned unit.

### 4.2 Description quality is its own problem
Skill triggering depends heavily on the `description` field. Trigger evaluation must be a dedicated capability, not an afterthought.

### 4.3 Progressive disclosure matters
Agents initially rely on skill catalog metadata and load full instructions only when needed. Therefore:
- the catalog must surface `name` + `description`
- the body and bundled files must be evaluated separately from triggering
- the linter must detect when `SKILL.md` is bloated and should be split into `references/` or `assets/`

### 4.4 Real execution beats synthetic evaluation
Promotion decisions must be based on runs executed through a real Claude Code backend in isolated workspaces. Mocked or prompt-only tests are useful for unit tests, but not for promotion.

### 4.5 Start with evals, not theory
When a skill is weak, the right sequence is:
1. observe failures on representative tasks
2. write evals
3. improve the skill
4. re-run
The product must make this sequence natural.

### 4.6 Human labels come first
The first quality loop must be:
- domain expert or PM reviews outputs
- assigns binary pass/fail or pairwise preference
- writes critiques
Only then should the product build or refine LLM judges.

### 4.7 Binary is the default
For most subjective quality judgments, the core primitive is binary pass/fail with critique. Scorecards and Likert scales may exist for exploration, but they must not be the promotion default.

### 4.8 Deterministic before model-judged
When something can be verified mechanically, use code. LLM judges are for scoped, subjective, hard-to-code checks.

### 4.9 Optimizers must not control the benchmark
The auto-improvement loop may optimize against:
- train suite
- validation suite
It must **never** rewrite or optimize against frozen holdout suites used for promotion.

### 4.10 Simplicity beats framework theatre
The architecture should use simple, composable patterns and avoid unnecessary orchestration complexity. Long-running workflows are allowed, but every layer must be debuggable.

### 4.11 Human oversight is mandatory for high-stakes transitions
The system may auto-generate candidates and auto-run evals, but promotion of a new “best” version to the default skill version requires human approval.

---

## 5. Users

### Primary user
A technical power user building and iterating on Claude Code skills for coding, research, documents, strategy, or workflow automation.

### Secondary user
A small team sharing skill ownership, reviewing outputs, and maintaining a common quality bar.

### Tertiary user
A PM or domain expert who does not edit the skill directly but reviews outputs and labels quality.

---

## 6. Goals

### 6.1 Product goals
1. **Repository MVP:** multiple skills, multiple versions, associated files, diffs, rollback.
2. **Execution truth:** every serious evaluation runs against a real Claude Code CLI executor.
3. **Eval rigor:** trigger, output, workflow, regression, and human blind comparison are supported.
4. **Judge calibration:** human-labeled data can be used to align LLM judges.
5. **Auto-improvement:** users can launch bounded optimizer runs that hill-climb toward better skill quality.
6. **Creation wizard:** users can create a new skill from artifacts, examples, and desired outcomes, and get an initial eval suite automatically.

### 6.2 Non-goals
1. General prompt management for every LLM system.
2. A public skill marketplace.
3. Full enterprise multi-tenant SaaS in v1.
4. Fully autonomous production rollout without human approval.
5. Replacing Anthropic’s own APIs or Claude Code itself.

---

## 7. Release model

The product will be built in one repository, but functionality ships in feature-flagged layers.

### Phase 1 — Real MVP (must work first)
- skill repository
- internal Git versioning
- skill import/export
- diff and rollback
- frontmatter/spec validation
- static best-practice linting
- manual run harness against real Claude Code CLI
- smoke eval support

### Phase 2 — Eval Lab
- trigger evals
- output evals with assertions
- baseline vs current comparisons
- trace capture
- benchmark dashboards
- regression suite management

### Phase 3 — Human Review + Judge Calibration
- blind A/B review arena
- preference capture
- binary pass/fail + critique annotation
- judge prompt versioning
- calibration metrics vs human labels

### Phase 4 — AutoResearch / Optimizer
- evaluator-optimizer loop
- mutation strategies
- keep/discard/crash lineage
- bounded budgets
- candidate branches
- promotion gate

### Phase 5 — Skill Creation Wizard
- conversational intake
- artifact ingestion
- initial skill drafting
- initial eval generation
- first-run smoke benchmark

---

## 8. Product requirements

## 8.1 Repository and versioning

### User stories
- As a user, I can create multiple skill repositories.
- As a user, I can save multiple immutable versions of a skill repository.
- As a user, each version includes `SKILL.md` plus all associated files.
- As a user, I can compare any two versions and see file-level diffs.
- As a user, I can restore an old version as the current draft.
- As a user, I can branch from any version for experiments.
- As a user, I can export a version as a zip or folder.
- As a user, I can optionally sync approved versions to a GitHub remote later.

### Functional requirements
- Each skill repository is backed by an **internal bare Git repo**.
- Every save creates a commit.
- Every version has:
  - repository id
  - commit SHA
  - parent SHA(s)
  - author
  - timestamp
  - commit message
  - semantic labels/tags
  - derived metadata (token count, line count, files count)
- The canonical folder structure is preserved exactly.
- Associated files may include, but are not limited to:
  - `SKILL.md`
  - `references/**`
  - `scripts/**`
  - `assets/**`
  - `evals/**`
  - `fixtures/**`
  - `README.md`
  - `LICENSE*`
- The app must support:
  - create repo from scratch
  - import existing local skill folder
  - import from zip
  - clone from git URL
  - export any version

### Acceptance criteria
- User can create 3 skill repos and 10 versions per repo.
- Rollback reproduces the exact prior file tree hash.
- Diffs show added/removed/changed files and inline text diffs.
- Importing and immediately exporting a repo produces byte-identical content, excluding app metadata files.

---

## 8.2 Skill spec validation and best-practice linting

### Purpose
The linter must combine:
1. **spec compliance**
2. **Claude Code frontmatter behavior**
3. **Anthropic / Agent Skills best practices**
4. **observed-trace recommendations**

### Validation layers

#### A. Hard validation (must pass)
- `SKILL.md` exists
- frontmatter parses
- `name` exists or directory name can supply it
- `name` matches directory rules
- `description` exists
- `description` length <= 1024 chars
- invalid YAML fails fast
- malformed file references are flagged
- duplicate paths fail
- repository can be materialized to a temp workspace

#### B. Strong warnings
- skill is too broad / too generic
- `description` describes implementation instead of user intent
- `description` lacks “when to use it” cues
- side-effecting skill does not set `disable-model-invocation: true`
- `SKILL.md` exceeds recommended line/token budget
- body contains generic filler like “handle errors appropriately”
- too many equivalent options are listed with no default
- output format is constrained but no explicit template is provided
- destructive or fragile workflow lacks plan-validate-execute sequence
- repeated failure corrections are not being captured as gotchas
- repeated manual logic should become a bundled script
- skill has no trigger eval suite
- skill has no output eval suite

#### C. Advisory recommendations
- split body into `references/` for progressive disclosure
- move repeated deterministic logic into `scripts/`
- add validation loop
- add examples
- add gotchas section
- add baseline benchmark
- add regression cases from previous failures

### Best-practice scorecard categories
Each skill version receives a scorecard with category-level ratings and evidence:

1. **Spec correctness**
2. **Trigger quality**
3. **Scope clarity**
4. **Context efficiency**
5. **Instruction quality**
6. **Safety/control**
7. **Validation discipline**
8. **Scriptability/determinism**
9. **Eval coverage**
10. **Observed execution quality**

### Acceptance criteria
- Invalid spec errors are blocking.
- Warnings are evidence-backed and cite exact file/line ranges.
- The linter can run on save and in CI.
- The scorecard persists per version and can be diffed between versions.

---

## 8.3 Real Claude Code execution harness

### Why this matters
The product’s core claim is that it evaluates skills against actual Claude Code behavior. Therefore the executor is not optional.

### Executor model
Use an **executor adapter** interface with a mandatory implementation:

- `ClaudeCliExecutor` (**required** for all promotion paths)
- `ClaudeSdkExecutor` (**optional future adapter**, non-promotion by default)

### Environment assumptions
The primary executor host is:
- Linux
- has `claude` installed
- is already authenticated
- has `git`, `jq`, Node, and Python available
- can create temp directories and, ideally, temp containers/VMs

### Execution modes
Support:
- read-only / planning runs
- edit runs inside isolated temp workspace
- side-effect runs inside isolated temp workspace with explicit allowlists
- repeated runs for stochastic evaluation

### Required runner behavior
For every run the executor must:
1. create an isolated temp workspace
2. materialize the target skill version
3. materialize fixtures/input files
4. configure the skill so Claude Code can discover it
5. run Claude Code in non-interactive mode
6. capture:
   - stdout
   - stderr
   - exit code
   - duration
   - token counts when available
   - output files
   - tool calls / JSON transcript
   - executor metadata (`claude --version`, OS, job id)
7. store all artifacts immutably
8. clean up temp workspace unless debugging retention is requested

### Command defaults
Use CLI print mode with structured or JSON output where helpful. The harness must support flags for:
- `-p`
- `--output-format json`
- `--json-schema`
- `--max-turns`
- `--permission-mode`
- `--model`
- `--effort`
- `--allowedTools` / settings-based allowlists as needed

### Safety defaults
- Default to `plan` or read-safe execution for smoke checks.
- Use `acceptEdits` only inside isolated workspaces.
- Use `bypassPermissions` only inside throwaway containers/VMs and only when explicitly requested by the suite definition.
- Block access to host secrets, home directory secrets, SSH material, and production repos.

### Acceptance criteria
- A smoke eval can run a skill end-to-end in an isolated workspace.
- The trace stores enough detail to tell whether the skill triggered.
- Runner metadata is persisted so version drift in Claude Code can be diagnosed.

---

## 8.4 Trigger evals

### Why trigger evals exist
A skill that never activates is effectively broken. Trigger quality is separate from output quality.

### Dataset model
A trigger suite contains:
- query text
- `should_trigger` boolean
- tags
- split (`train`, `validation`, `holdout`)
- notes
- optional rationale

### Run protocol
For each query:
- run the agent multiple times (default 3)
- detect whether the skill was invoked
- compute trigger rate
- compare against threshold (default 0.5)
- aggregate metrics

### Required metrics
- should-trigger pass rate
- should-not-trigger pass rate
- false positive rate
- false negative rate
- precision
- recall
- F1
- overall pass rate
- per-split metrics

### Description optimizer support
The system must support a dedicated description-optimization mode:
- optimize only on train split
- validate on validation split
- never touch holdout during search
- store all attempted descriptions and metrics

### Acceptance criteria
- User can upload a 20-query trigger suite.
- System runs 3x per query and computes trigger metrics.
- User can compare current description vs previous description.
- User can promote a better description without changing the rest of the skill.

---

## 8.5 Output evals and workflow evals

### Core principle
Each output or workflow test must run:
- **with current skill**
- **with baseline**
Where baseline is:
- no skill, or
- previous skill version, or
- pinned “champion” version

### Test case schema
Each eval case contains:
- id
- name
- prompt
- fixture files
- expected outcome description
- assertions
- tags
- split (`train`, `validation`, `holdout`)
- allowed execution mode
- optional custom validator script
- optional judge rubric id
- optional human review required flag

### Assertion types
Support:
1. **code assertions**
   - file exists
   - file hash or schema validation
   - JSON validity
   - row count
   - exact or fuzzy structure checks
   - file diff constraints
   - output path checks
2. **LLM-judged assertions**
   - scoped binary judgments with evidence
3. **human review**
   - binary pass/fail with critique
4. **pairwise preference**
   - blind A/B selection

### Required stored outputs per case
- prompt used
- baseline outputs
- candidate outputs
- generated files
- timing stats
- token stats
- transcript
- assertion results with evidence
- overall verdict

### Benchmark summary
For every suite run compute:
- pass rate mean/stddev
- duration mean/stddev
- token mean/stddev
- delta vs baseline
- wins/losses/ties vs baseline
- failure clusters by tag

### Acceptance criteria
- User can run a suite of at least 10 cases.
- Every case stores baseline and candidate artifacts separately.
- Benchmark page shows delta vs baseline and failure clustering.
- Re-running the same suite on the same version is reproducible in structure, even if stochastic outcomes vary.

---

## 8.6 Human review arena (blind testing)

### Why this exists
Assertions miss holistic quality. Blind review removes anchoring bias and produces durable preference data.

### Review modes
1. **Binary review**
   - Did this output meet the user’s goal? Pass/fail.
2. **Pairwise blind A/B**
   - Which output is better, A or B?
   - tie allowed
3. **Critique capture**
   - freeform but encouraged to be actionable

### Rendering requirements
The review UI must render artifacts in domain-appropriate ways:
- markdown rendered as markdown
- JSON pretty view
- code with syntax highlighting
- file diffs
- image/chart preview
- plain text
- multi-file output browser
- transcript drill-down

### Required review UX
- keyboard shortcuts
- progress bar
- save-and-next flow
- filtering by tag, failure type, version pair
- hidden version identity until after selection
- optional think-aloud notes
- reviewer confidence field

### Stored review data
- reviewer
- session id
- case id
- pair id
- selected winner / pass-fail label
- critique
- confidence
- duration
- timestamp

### Acceptance criteria
- User can review 50 blind comparisons in one session.
- Version identity is hidden during review.
- Feedback is exportable and linkable back to cases, versions, and optimizer candidates.

---

## 8.7 Judge creation and calibration

### Philosophy
LLM judges are useful only after they are aligned to human labels on a constrained task.

### Judge object model
Each judge has:
- judge id
- purpose
- scope
- prompt version
- target criterion
- model
- output schema
- calibration dataset version
- calibration metrics
- status (`draft`, `candidate`, `calibrated`, `deprecated`)

### Calibration pipeline
1. human review produces pass/fail labels and critiques
2. system clusters critiques into candidate criteria
3. user or system drafts a scoped binary judge
4. judge is evaluated on held-out human-labeled examples
5. system computes:
   - confusion matrix
   - TPR
   - TNR
   - precision
   - recall
   - agreement rate
   - drift vs previous judge
6. only calibrated judges can influence promotion scores

### Judge usage rules
- Judges must be **binary by default**
- Judges must return **evidence**
- Judges must not grade dimensions they were not trained/calibrated for
- Judges may be reused only for compatible criteria
- Judges may assist, but human labels remain the gold standard

### Acceptance criteria
- User can create a draft judge from labeled examples.
- System shows calibration metrics vs human labels.
- Promotion scoring can weight calibrated judge verdicts but not uncalibrated ones.

---

## 8.8 Error analysis and trace lab

### Purpose
This is the Hamel-style “look at the data” surface.

### Requirements
The trace lab must let users:
- browse traces by suite, version, tag, status, model, judge result
- filter to likely-problematic traces
- cluster similar failures
- open baseline and candidate outputs side-by-side
- inspect tool calls, timings, generated files, and final outputs
- convert a trace into:
  - regression test
  - critique
  - gotcha
  - validator improvement
  - optimizer seed idea

### Required derived views
- top recurring failure modes
- high-token outliers
- high-latency outliers
- flaky cases (same test, inconsistent outcomes)
- “passes assertions but loses blind review” cases
- “judge disagrees with human” cases

### Acceptance criteria
- Reviewer can turn any trace into a new regression case in one action.
- System can group at least basic repeated failures by tag and embedding similarity.
- Trace lab is the default starting point for improving weak skills.

---

## 8.9 AutoResearch / optimizer

### Goal
Given a baseline skill version and a frozen eval regime, the system should autonomously propose, test, and rank improved candidate versions.

### Design inspiration
The optimizer uses a Karpathy-style keep/discard loop:
- make one candidate change
- run it on real evaluation
- keep it if it improves the objective
- discard or revert if it does not
- log every attempt, including crashes

### Optimizer modes
1. **Description-only**
2. **Instruction-only**
3. **Structure**
   - split references
   - move repeated logic to scripts
   - add templates/gotchas/checklists
4. **Safety/control**
   - frontmatter tightening
   - tool restrictions
   - validation loops
5. **Full skill mutation**
6. **Research-assisted**
   - scans best practices, prior failures, and critiques before proposing edits

### Mutation operators
The optimizer may:
- rewrite `description`
- rewrite or tighten instructions
- add or remove examples
- convert menu-like instructions into defaults
- add gotchas from recurring critiques
- add templates for structured output
- add validation loops
- transform fragile tasks into plan-validate-execute workflows
- move verbose sections into `references/`
- write or update bundled validator/helper scripts
- add or remove frontmatter fields
- create shorter, more coherent subflows

The optimizer may **not**:
- modify frozen holdout suites
- edit human labels
- directly promote a version without passing gates
- access unrestricted host paths
- push to production remotes automatically

### Search strategy
Use bounded hill climbing with optional beam search:
- start from champion
- generate N candidates per round
- run quick train suite
- run validation suite for survivors
- optionally run selective blind review
- update champion only if promotion rules pass

### Candidate lifecycle
Each candidate gets:
- branch name
- parent version
- patch diff
- rationale
- mutation category
- run budget
- status (`queued`, `running`, `keep`, `discard`, `crash`, `blocked`)
- metrics snapshot

### Required logs
For each candidate, persist:
- before/after diff
- objective metrics
- trace summary
- human feedback if any
- keep/discard reason
- crash reason if applicable

### Promotion rules
A candidate becomes the new champion only if:
1. validation pass rate improves by configured threshold, **or**
2. holdout improves with no unacceptable regressions, **and**
3. safety/control checks pass, **and**
4. human approval is granted

### Objective function
Default promotion score:
- weighted deterministic assertions
- calibrated judge verdicts
- blind human preferences
- trigger eval performance
- regression pass rate
- penalty for time/token blowups
- penalty for increased flakiness
- penalty for linter regressions

### Acceptance criteria
- User can run a bounded optimizer job with max iterations and budget.
- Every candidate version is traceable and reversible.
- The system never edits frozen holdout data.
- A successful run can surface a new candidate champion with full evidence.

---

## 8.10 Wizard for creating new skills

### Problem
LLM-generated first drafts are usually generic unless grounded in real context.

### Wizard modes
1. **Extract from a successful hands-on task**
2. **Synthesize from existing artifacts**
3. **Hybrid**

### Inputs
The wizard must accept:
- freeform intent
- example tasks
- example prompts
- successful Claude conversations
- corrections made by the user
- internal docs / runbooks / style guides
- APIs / schemas / config files
- code review notes
- failure cases
- desired output formats
- safety constraints
- allowed tools

### Outputs
The wizard must produce:
1. initial skill folder
2. initial `SKILL.md`
3. recommended `references/`, `scripts/`, and `assets/`
4. trigger eval suite
5. output/workflow eval suite
6. baseline assertions
7. initial judge candidate prompts (optional)
8. first-run benchmark plan

### Wizard flow
1. collect intent and artifacts
2. extract the coherent unit of work
3. identify boundaries: when to trigger, when not to trigger
4. identify defaults, gotchas, fragile steps, output format
5. draft skill
6. draft evals
7. run smoke eval vs no-skill baseline
8. present issues and iterate once before first save

### Acceptance criteria
- User can create a new skill from scratch in one guided flow.
- The first saved version always includes at least:
  - valid `SKILL.md`
  - one trigger suite
  - one output/workflow suite
  - one smoke benchmark run

---

## 8.11 GitHub and development workflow

### For the product codebase
The coding agent building this application must:
- work in a Git repository from minute one
- commit after every passing vertical slice
- push regularly to GitHub
- tag milestone checkpoints
- never batch huge unreviewable changes into one commit

### Mandatory commit checkpoints
1. scaffold + CI green
2. parser/validator layer green
3. internal Git storage green
4. skill CRUD UI green
5. real CLI smoke runner green
6. trigger eval runner green
7. output eval runner green
8. blind arena green
9. judge calibration green
10. optimizer green
11. wizard green
12. full acceptance suite green

### For skill repositories
- every saved version is a Git commit
- every optimizer candidate is its own branch or commit lineage
- approved promotions create annotated tags
- optional GitHub remote sync can push:
  - `main`
  - `champion/*`
  - `experiments/*`

---

## 9. System architecture

## 9.1 Opinionated stack

Use a monorepo.

### Recommended stack
- **Frontend:** Next.js, React, TypeScript, Tailwind, shadcn/ui
- **Backend/API:** Next.js route handlers or a colocated Node API service
- **Workers:** Node worker processes with BullMQ
- **Database:** PostgreSQL
- **Queue:** Redis + BullMQ
- **Git storage:** native `git` via CLI wrapper (`simple-git`) or equivalent
- **File/blob storage:** local filesystem for dev, S3-compatible object store for prod
- **Auth:** NextAuth or equivalent (single-user local mode first)
- **Testing:** Vitest, Playwright, supertest-style API tests
- **Real CLI acceptance:** self-hosted GitHub runner with authenticated Claude Code CLI

### Why this stack
- one language for most of the system
- easy integration with `child_process`
- straightforward web UI + job queue
- good DX for a coding agent
- no unnecessary orchestration framework

## 9.2 Services
1. **Web UI**
2. **API service**
3. **Git/versioning service**
4. **Executor service**
5. **Eval grading service**
6. **Judge calibration service**
7. **Optimizer service**
8. **Artifact storage service**

## 9.3 Execution topology
- app server
- worker server(s)
- one or more Claude executor hosts
- optional sandbox runtime layer (Docker/Firecracker/VM)

---

## 10. Data model

The following entities are required.

### 10.1 Core entities
- `workspace`
- `user`
- `skill_repo`
- `skill_branch`
- `skill_version`
- `skill_file`
- `artifact_blob`

### 10.2 Eval entities
- `eval_suite`
- `eval_case`
- `eval_case_fixture`
- `eval_run`
- `eval_case_run`
- `assertion_result`
- `benchmark_snapshot`

### 10.3 Review entities
- `review_session`
- `review_label`
- `pairwise_comparison`
- `preference_vote`
- `critique`

### 10.4 Judge entities
- `judge_definition`
- `judge_prompt_version`
- `judge_calibration_run`
- `judge_example`

### 10.5 Optimizer entities
- `optimizer_run`
- `optimizer_candidate`
- `optimizer_mutation`
- `optimizer_decision`

### 10.6 Trace entities
- `trace`
- `tool_event`
- `run_artifact`
- `log_chunk`

### 10.7 Suggested minimal fields

#### `skill_repo`
- id
- workspace_id
- slug
- display_name
- description
- default_branch
- current_champion_version_id
- created_at
- updated_at

#### `skill_version`
- id
- skill_repo_id
- branch_name
- git_commit_sha
- parent_version_id
- commit_message
- created_by
- created_at
- token_count
- line_count
- linter_score
- is_champion
- notes

#### `eval_suite`
- id
- skill_repo_id
- name
- type (`trigger`, `output`, `workflow`, `regression`, `blind`, `calibration`)
- split_policy
- version
- frozen
- created_at

#### `eval_case`
- id
- eval_suite_id
- key
- name
- prompt
- should_trigger (nullable)
- expected_outcome
- split
- tags
- config_json

#### `eval_run`
- id
- skill_repo_id
- skill_version_id
- baseline_version_id
- suite_id
- executor_type
- claude_version
- model
- effort
- permission_mode
- status
- started_at
- completed_at
- metrics_json

#### `optimizer_candidate`
- id
- optimizer_run_id
- parent_version_id
- candidate_version_id
- mutation_type
- rationale
- status
- objective_json
- created_at

---

## 11. Core API surface

This is the minimum contract the coding agent must expose.

### Repositories
- `POST /api/skill-repos`
- `GET /api/skill-repos`
- `GET /api/skill-repos/:id`
- `POST /api/skill-repos/:id/import`
- `POST /api/skill-repos/:id/export`
- `POST /api/skill-repos/:id/versions`
- `GET /api/skill-repos/:id/versions/:versionId`
- `GET /api/skill-repos/:id/diff?from=...&to=...`
- `POST /api/skill-repos/:id/restore/:versionId`

### Validation
- `POST /api/skill-repos/:id/lint`
- `GET /api/skill-repos/:id/lint/:versionId`

### Evals
- `POST /api/eval-suites`
- `POST /api/eval-suites/:id/cases`
- `POST /api/eval-runs`
- `GET /api/eval-runs/:id`
- `GET /api/eval-runs/:id/traces`
- `POST /api/eval-runs/:id/promote-failures-to-regression`

### Review
- `POST /api/review-sessions`
- `POST /api/review-sessions/:id/labels`
- `POST /api/review-sessions/:id/votes`

### Judges
- `POST /api/judges`
- `POST /api/judges/:id/calibrate`
- `GET /api/judges/:id`

### Optimizer
- `POST /api/optimizer-runs`
- `GET /api/optimizer-runs/:id`
- `POST /api/optimizer-runs/:id/stop`
- `POST /api/optimizer-runs/:id/promote-candidate/:candidateId`

### Wizard
- `POST /api/wizard/draft`
- `POST /api/wizard/draft/:id/generate`
- `POST /api/wizard/draft/:id/save`

---

## 12. Evaluation methodology

## 12.1 Scoring hierarchy
Use this priority order:

1. **Mechanical truth**
   - code assertions
   - file validators
   - schema checks
   - exact or structural constraints
2. **Scoped calibrated judges**
3. **Human binary review**
4. **Human blind pairwise preference**

For promotion:
- deterministic failures can veto promotion
- holdout regressions veto promotion
- human approval is mandatory

## 12.2 Suite taxonomy
Every skill repo must eventually support:

### Trigger suite
Should it activate?

### Task success suite
Did it achieve the user’s goal end-to-end?

### Step diagnostic suite
Why did it fail?

### Regression suite
Did we re-break known failures?

### Human review suite
Would a reviewer prefer this version?

### Calibration suite
Does the judge align with human labels?

## 12.3 Split policy
Use explicit data splits:

- **train** — optimizer may inspect
- **validation** — optimizer may observe results but may not edit examples
- **holdout** — optimizer may only see aggregate metrics
- **shadow production** — optional real-world logs held back for later analysis

## 12.4 Flakiness policy
Because model behavior is nondeterministic:
- repeat trigger tests 3x by default
- allow repeated output runs for flaky cases
- compute stability metrics
- penalize versions that increase variance without improving quality

## 12.5 Promotion default weights
Provide configurable weights with these defaults:
- deterministic assertions: 40%
- regression suite: 20%
- trigger suite: 10%
- calibrated judges: 15%
- blind human preference: 15%
- penalties:
  - token blowup
  - latency blowup
  - linter regressions
  - flakiness increase

---

## 13. UI / UX requirements

## 13.1 Main navigation
- Repositories
- Versions
- Evals
- Review Arena
- Judges
- Optimizer
- Wizard
- Settings / Executors

## 13.2 Repository screen
Must show:
- all skill repos
- current champion
- recent activity
- failing suites
- optimization runs in progress

## 13.3 Version detail screen
Must show:
- full file tree
- frontmatter summary
- best-practice scorecard
- diffs vs baseline/champion
- linked eval runs
- linked reviews
- linked optimizer lineage

## 13.4 Eval run screen
Must show:
- status
- suite summary
- case outcomes
- deltas vs baseline
- traces
- artifacts
- failure clusters
- rerun buttons

## 13.5 Review arena
Must show:
- one task at a time
- A/B outputs or single output
- fast labeling controls
- critique box
- progress
- optional transcript drilldown

## 13.6 Optimizer screen
Must show:
- objective function
- budget
- candidate queue
- keep/discard/crash table
- lineage graph
- current champion
- manual stop button
- promotion button

## 13.7 Wizard screen
Must show:
- intake form + artifact upload
- generated draft preview
- generated eval preview
- smoke benchmark result
- save version action

---

## 14. Security and safety requirements

### Mandatory requirements
- All real execution occurs in isolated temp workspaces.
- Destructive modes are disabled by default.
- `bypassPermissions` is allowed only in isolated containers/VMs.
- Secrets are redacted from logs.
- Executor host paths are allowlisted.
- Network is blocked by default for evals unless explicitly required by the suite.
- Promotion to champion requires human approval.
- All runs are auditable.
- Every optimizer action is reversible.

### Sensitive path restrictions
Deny by default:
- `~/.ssh/**`
- `.env*`
- cloud credential files
- production repos
- host-level config
- arbitrary absolute paths

### Audit log requirements
Persist:
- who launched the run
- what version was tested
- what executor was used
- what permission mode was used
- which model/effort was used
- what was modified
- what was promoted

---

## 15. Non-functional requirements

### Reliability
- queued jobs survive worker restarts
- partial traces are retained on failure
- executor crashes are surfaced clearly

### Performance
- repository browsing should feel instant for normal skill sizes
- long runs stream status updates
- artifact downloads must work for multi-file outputs

### Observability
- structured logs
- run-level metrics
- executor health dashboard
- trace search/filter

### Reproducibility
- every run stores:
  - skill version SHA
  - suite version
  - model
  - Claude Code version
  - permission mode
  - runner image/version
- exact rerun should be possible later

### Maintainability
- thin vertical slices
- strong test coverage on core services
- limited framework magic
- clean domain boundaries

---

## 16. Implementation plan (TDD-first, vertical slices)

## Slice 0 — Scaffold
### Deliverables
- monorepo
- app shell
- Postgres + Redis + local blob storage
- CI
- lint/format/test commands
- GitHub repo initialized

### Tests
- health endpoint
- DB migration smoke
- queue smoke

### Commit checkpoint
`chore: scaffold monorepo, infra, and CI`

---

## Slice 1 — Skill parser and validator
### Deliverables
- file upload/import
- `SKILL.md` parser
- frontmatter validation
- spec compliance checks
- best-practice warning engine v1

### Tests
- valid/invalid names
- description length
- malformed YAML
- directory mismatch
- generic warning detection
- oversized body detection

### Commit checkpoint
`feat: add skill parser and validation engine`

---

## Slice 2 — Internal Git-backed repository
### Deliverables
- create repo
- save version
- diff versions
- restore version
- branch support

### Tests
- commit creation
- file tree round-trip
- diff correctness
- restore correctness
- concurrent save protection

### Commit checkpoint
`feat: add git-backed skill versioning`

---

## Slice 3 — Repository UI
### Deliverables
- repo list
- version list
- diff viewer
- save/restore flows

### Tests
- Playwright CRUD
- diff rendering
- rollback flow

### Commit checkpoint
`feat: ship repository MVP UI`

---

## Slice 4 — Real Claude CLI smoke executor
### Deliverables
- executor interface
- CLI runner
- temp workspace materializer
- artifact capture
- trace persistence

### Tests
#### Unit / contract
- parse CLI JSON
- store artifacts
- status transitions
#### Integration
- fake `claude` binary contract test
#### Real acceptance
- opt-in self-hosted runner test with authenticated Claude Code

### Commit checkpoint
`feat: add real Claude CLI execution harness`

---

## Slice 5 — Trigger evals
### Deliverables
- trigger suite CRUD
- repeated trigger runs
- metric computation
- description comparison screen

### Tests
- should-trigger / should-not-trigger scoring
- threshold behavior
- train/validation split handling
- CLI trace detection

### Commit checkpoint
`feat: add trigger eval engine`

---

## Slice 6 — Output/workflow evals
### Deliverables
- eval case CRUD
- baseline vs candidate runs
- assertion engine
- benchmark summaries

### Tests
- code assertion engine
- baseline/candidate artifact separation
- benchmark math
- rerun idempotency

### Commit checkpoint
`feat: add output and workflow eval engine`

---

## Slice 7 — Trace lab
### Deliverables
- trace browser
- artifact viewer
- failure clustering v1
- promote trace to regression

### Tests
- trace retrieval
- filter/search
- regression promotion flow

### Commit checkpoint
`feat: add trace lab and regression capture`

---

## Slice 8 — Human review arena
### Deliverables
- blind A/B review
- pass/fail review
- critique storage
- progress UX

### Tests
- version identity hidden in pairwise mode
- review storage
- keyboard workflow
- export reviews

### Commit checkpoint
`feat: add blind review arena`

---

## Slice 9 — Judge calibration
### Deliverables
- judge prompt objects
- calibration jobs
- confusion matrix metrics
- judge status lifecycle

### Tests
- metric calculations
- calibration split handling
- uncalibrated judge blocked from promotion weighting

### Commit checkpoint
`feat: add judge calibration pipeline`

---

## Slice 10 — Optimizer
### Deliverables
- bounded candidate loop
- mutation operators v1
- train/validation/holdout discipline
- keep/discard/crash logs
- promotion gating

### Tests
- candidate lineage
- mutation application
- frozen holdout cannot be edited
- objective scoring
- manual stop/promote flow

### Commit checkpoint
`feat: add skill optimizer`

---

## Slice 11 — Wizard
### Deliverables
- intent + artifact intake
- initial skill generation
- initial eval generation
- smoke benchmark
- save draft as version

### Tests
- wizard saves valid repo
- generated repo includes required pieces
- smoke eval auto-launch works

### Commit checkpoint
`feat: add new skill wizard`

---

## Slice 12 — Hardening and acceptance
### Deliverables
- full docs
- deployment scripts
- self-hosted GitHub Actions runner docs
- seed examples
- acceptance dashboard

### Tests
- full end-to-end acceptance on real executor
- failure recovery
- backup/restore

### Commit checkpoint
`feat: productionize SkillForge v1`

---

## 17. Test strategy

## 17.1 Test pyramid
### Unit tests
- parser
- linter rules
- metrics math
- diff logic
- scoring logic
- mutation logic

### Contract tests
- executor JSON parsing
- fake Claude CLI responses
- artifact contract

### Integration tests
- repository save/diff/restore
- queue + worker + DB
- suite orchestration

### E2E UI tests
- repository CRUD
- run eval
- review arena
- optimizer screen
- wizard

### Real acceptance tests
Run only on a self-hosted runner with authenticated Claude Code:
- smoke skill run
- trigger eval suite
- output eval suite
- blind review seed generation
- optimizer bounded run

## 17.2 CI lanes
### Fast lane (every push)
- unit
- contract
- integration
- frontend E2E smoke

### Real lane (self-hosted)
- real Claude smoke
- selected acceptance suites

### Nightly
- longer real suites
- optimizer soak test
- drift detection against current Claude Code version

---

## 18. Deployment model

### v1 deployment
- self-hosted Docker Compose or equivalent
- one app server
- one worker
- Postgres
- Redis
- local/S3 blob store
- one authenticated executor host

### v2 deployment
- multiple workers
- multiple executor hosts
- sandbox pool
- GitHub remote sync
- SSO and team workspaces

---

## 19. Acceptance criteria (product-level)

The product is acceptable only if all of the following are true:

1. User can store multiple skills with multiple immutable versions.
2. Every saved version preserves `SKILL.md` and associated files.
3. User can diff and restore versions reliably.
4. User can run a real Claude Code smoke benchmark against any version.
5. User can run trigger evals and see false positives/negatives.
6. User can run output/workflow evals against baseline and candidate.
7. User can review blind A/B outputs and store preferences + critiques.
8. User can calibrate an LLM judge against human labels.
9. User can launch a bounded optimizer run and inspect keep/discard/crash lineage.
10. User can create a new skill from artifacts and immediately benchmark it.
11. Promotion to champion is blocked unless required gates pass.
12. The coding agent built the app in TDD slices with regular GitHub commits.

---

## 20. Risks and mitigations

### Risk: optimizer overfits to benchmark
**Mitigation:** fixed train/validation/holdout splits, frozen holdout, human review gate.

### Risk: real CLI runs are expensive / slow
**Mitigation:** tiered evaluation cascade, quick suites before full suites, selective blind review.

### Risk: judge becomes the new source of truth without being trustworthy
**Mitigation:** uncalibrated judges cannot influence promotion; judge metrics are always shown next to human agreement.

### Risk: dangerous file edits or shell access
**Mitigation:** isolated workspaces, permission allowlists, deny rules, container/VM execution for bypass mode.

### Risk: skill “improves” metrics while getting harder to maintain
**Mitigation:** linter penalties for bloat, complexity notes in candidate rationale, human approval before promotion.

### Risk: product becomes overly abstract and hard to debug
**Mitigation:** simple Node stack, explicit services, stored artifacts and traces for every run.

---

## 21. Open questions and chosen defaults

To avoid blocking a one-shot build, these defaults are chosen now.

### Q1. Internal Git only or GitHub sync in MVP?
**Chosen default:** internal Git in MVP, optional GitHub sync after core flows work.

### Q2. Multi-tenant or single-user first?
**Chosen default:** single-user / single-workspace first, but schema remains workspace-aware.

### Q3. CLI or SDK as primary executor?
**Chosen default:** CLI is primary and required for promotion. SDK is optional later.

### Q4. LLM judge or human review first?
**Chosen default:** human review first; judge is built from human labels.

### Q5. Should optimizer be able to edit evals?
**Chosen default:** it may propose eval additions, but cannot mutate frozen validation/holdout data automatically.

### Q6. Should wizard use generic prompting if there are no artifacts?
**Chosen default:** yes, but with a strong warning that the result is likely generic and should be grounded before serious use.

---

## 22. Build instructions for the coding agent

The coding agent implementing this PRD must follow these rules:

1. Work in a Git repo from the first commit.
2. Use TDD for every slice.
3. Keep each slice small and demonstrably working before moving on.
4. Commit after every green slice.
5. Push regularly to GitHub.
6. Do not skip the real Claude CLI acceptance harness.
7. Do not build the optimizer before the repository + eval spine exists.
8. Do not let uncalibrated judges or train-only scores decide promotions.
9. Do not use broad framework abstractions that hide prompts, traces, or artifacts.
10. Prefer explicitness and inspectability over cleverness.

---

## 23. Source appendix

This PRD is grounded in:
- Anthropic Claude Code skills documentation
- Agent Skills specification and best-practice docs
- Anthropic guidance on evaluations and agent design
- Hamel Husain’s published eval methodology
- Andrej Karpathy’s `autoresearch` repository pattern

Suggested source bundle to keep alongside the repo:
- Anthropic: Claude Code skills, permissions, CLI reference, Agent SDK, eval docs, agent engineering posts
- Agent Skills: specification, best practices, optimizing descriptions, evaluating skills
- Hamel Husain: LLM judge guide, LLM evals FAQ, evals-skills repo
- Karpathy: `karpathy/autoresearch`