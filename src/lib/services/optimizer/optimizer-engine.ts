/**
 * Optimizer engine — bounded hill climbing loop.
 *
 * From PRD:
 * - Start from champion/baseline
 * - Generate N candidates per round
 * - Run quick train suite
 * - Run validation suite for survivors
 * - Update champion only if promotion rules pass
 * - Persist keep/discard/crash logs for every candidate
 */

import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '../audit-log'
import { generateMutation, type MutationMode } from './mutation-service'
import { computeObjectiveScore, shouldKeepCandidate, DEFAULT_WEIGHTS, type EvalMetrics, type ObjectiveWeights } from './objective-scoring'

// Re-export for convenience
export type { MutationMode }

interface OptimizerConfig {
  maxIterations: number
  candidatesPerRound: number
  mutationModes: MutationMode[]
  objectiveWeights: ObjectiveWeights
  promotionRules: {
    minImprovement?: number
    allowRegression?: boolean
    maxDurationRatio?: number
    maxTokenRatio?: number
  }
  suiteIds: string[]
  trainSuiteIds: string[]
  validationSuiteIds: string[]
}

const DEFAULT_MUTATION_MODES: MutationMode[] = [
  'description-only',
  'instruction-only',
  'structure',
  'full-skill',
]

/**
 * Main optimizer job handler. Called by the job queue.
 */
export async function handleOptimizerJob(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const optimizerRunId = payload.optimizerRunId as string
  if (!optimizerRunId) {
    throw new Error('optimizerRunId is required in job payload')
  }

  const run = await prisma.optimizerRun.findUnique({
    where: { id: optimizerRunId },
    include: {
      skillRepo: true,
    },
  })

  if (!run) {
    throw new Error(`Optimizer run ${optimizerRunId} not found`)
  }

  if (run.status === 'stopped') {
    return { status: 'stopped' }
  }

  if (run.status !== 'queued' && run.status !== 'running') {
    return { status: 'skipped', reason: `Run is already in '${run.status}' status` }
  }

  // Mark as running
  await prisma.optimizerRun.update({
    where: { id: optimizerRunId },
    data: { status: 'running', startedAt: new Date() },
  })

  await logAuditEvent({
    action: 'optimizer_run.started',
    entityType: 'optimizer_run',
    entityId: optimizerRunId,
    details: { skillRepoId: run.skillRepoId, baselineVersionId: run.baselineVersionId },
  })

  // Parse config
  const objectiveJson = JSON.parse(run.objectiveJson || '{}') as Partial<ObjectiveWeights>
  const promotionRules = JSON.parse(run.promotionRules || '{}') as OptimizerConfig['promotionRules']
  const suiteIds = run.suiteIds ? run.suiteIds.split(',').filter(Boolean) : []

  // Categorize suites by split
  const suites = await prisma.evalSuite.findMany({
    where: { id: { in: suiteIds } },
    select: { id: true, name: true, type: true },
  })

  const config: OptimizerConfig = {
    maxIterations: run.maxIterations,
    candidatesPerRound: 1, // default: one candidate per round for hill climbing
    mutationModes: DEFAULT_MUTATION_MODES,
    objectiveWeights: { ...DEFAULT_WEIGHTS, ...objectiveJson },
    promotionRules,
    suiteIds,
    trainSuiteIds: suiteIds, // Use all suites for train by default
    validationSuiteIds: suiteIds,
  }

  try {
    await runOptimizationLoop(optimizerRunId, run, config)

    // Mark as completed
    await prisma.optimizerRun.update({
      where: { id: optimizerRunId },
      data: { status: 'completed', completedAt: new Date() },
    })

    await logAuditEvent({
      action: 'optimizer_run.completed',
      entityType: 'optimizer_run',
      entityId: optimizerRunId,
    })

    return { status: 'completed' }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)

    await prisma.optimizerRun.update({
      where: { id: optimizerRunId },
      data: { status: 'failed', completedAt: new Date() },
    })

    await logAuditEvent({
      action: 'optimizer_run.failed',
      entityType: 'optimizer_run',
      entityId: optimizerRunId,
      details: { error: errorMsg },
    })

    throw err
  }
}

/**
 * Core optimization loop.
 */
async function runOptimizationLoop(
  optimizerRunId: string,
  run: { id: string; skillRepoId: string; baselineVersionId: string; maxIterations: number },
  config: OptimizerConfig
): Promise<void> {
  let currentBestVersionId = run.baselineVersionId

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    // Check if stopped
    const currentRun = await prisma.optimizerRun.findUnique({
      where: { id: optimizerRunId },
      select: { status: true },
    })
    if (currentRun?.status === 'stopped') {
      break
    }

    // Update iteration counter
    await prisma.optimizerRun.update({
      where: { id: optimizerRunId },
      data: { currentIteration: iteration + 1 },
    })

    // Pick a mutation mode for this round (cycle through modes)
    const mode = config.mutationModes[iteration % config.mutationModes.length]

    // Generate candidate
    const candidate = await generateCandidate(
      optimizerRunId,
      run.skillRepoId,
      currentBestVersionId,
      mode
    )

    if (!candidate) {
      // Record crash decision
      await recordDecision(optimizerRunId, null, 'crash', 'Failed to generate candidate')
      continue
    }

    try {
      // Evaluate candidate against train suites
      const candidateMetrics = await evaluateCandidate(
        candidate.id,
        run.skillRepoId,
        candidate.candidateVersionId,
        config.trainSuiteIds
      )

      // Evaluate baseline for comparison
      const baselineMetrics = await evaluateCandidate(
        null, // no candidate record for baseline
        run.skillRepoId,
        currentBestVersionId,
        config.trainSuiteIds
      )

      // Score both
      const candidateObjective = computeObjectiveScore(
        candidateMetrics,
        baselineMetrics,
        config.objectiveWeights
      )
      const baselineObjective = computeObjectiveScore(
        baselineMetrics,
        null,
        config.objectiveWeights
      )

      // Update candidate with objective score
      await prisma.optimizerCandidate.update({
        where: { id: candidate.id },
        data: {
          objectiveJson: JSON.stringify(candidateObjective),
        },
      })

      // Decide: keep or discard
      const decision = shouldKeepCandidate(
        candidateObjective,
        baselineObjective,
        config.promotionRules
      )

      if (decision.keep) {
        // Mark candidate as keep
        await prisma.optimizerCandidate.update({
          where: { id: candidate.id },
          data: { status: 'keep', completedAt: new Date() },
        })
        await recordDecision(optimizerRunId, candidate.id, 'keep', decision.reason, candidateObjective)

        // Update current best
        if (candidate.candidateVersionId) {
          currentBestVersionId = candidate.candidateVersionId
        }
      } else {
        // Mark candidate as discard
        await prisma.optimizerCandidate.update({
          where: { id: candidate.id },
          data: { status: 'discard', completedAt: new Date() },
        })
        await recordDecision(optimizerRunId, candidate.id, 'discard', decision.reason, candidateObjective)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)

      // Mark candidate as crash
      await prisma.optimizerCandidate.update({
        where: { id: candidate.id },
        data: { status: 'crash', error: errorMsg, completedAt: new Date() },
      })
      await recordDecision(optimizerRunId, candidate.id, 'crash', errorMsg)
    }
  }
}

/**
 * Generate a candidate version by applying a mutation to the current skill.
 */
async function generateCandidate(
  optimizerRunId: string,
  skillRepoId: string,
  parentVersionId: string,
  mode: MutationMode
): Promise<{ id: string; candidateVersionId: string | null } | null> {
  try {
    // Load parent version content
    const parentVersion = await prisma.skillVersion.findUnique({
      where: { id: parentVersionId },
      select: { id: true, gitCommitSha: true, commitMessage: true },
    })
    if (!parentVersion) return null

    // Load skill repo info
    const skillRepo = await prisma.skillRepo.findUnique({
      where: { id: skillRepoId },
      select: { gitRepoPath: true },
    })
    if (!skillRepo) return null

    // Read current skill content from git
    const { getFilesAtCommit } = await import('../git-storage')
    const files = await getFilesAtCommit(skillRepo.gitRepoPath, parentVersion.gitCommitSha)
    const skillFile = files.find(f => f.path.endsWith('SKILL.md'))
    const skillContent = skillFile?.content || ''
    const otherFiles = files.filter(f => !f.path.endsWith('SKILL.md'))

    // Load recent critiques for context
    const recentCritiques = await prisma.critique.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      where: {
        reviewLabel: {
          reviewSession: {
            skillRepoId,
          },
        },
      },
      select: { content: true },
    })

    // Generate mutation
    const mutationResult = await generateMutation({
      mode,
      currentSkillContent: skillContent,
      currentFiles: otherFiles.map(f => ({ path: f.path, content: f.content })),
      humanCritiques: recentCritiques.map(c => c.content),
    })

    // Create a new version from the mutated skill
    const { createVersion } = await import('../git-storage')
    const allFiles = [
      {
        path: skillFile?.path || 'SKILL.md',
        content: mutationResult.newSkillContent,
        size: Buffer.byteLength(mutationResult.newSkillContent, 'utf-8'),
      },
      ...mutationResult.newFiles.map(f => ({
        path: f.path,
        content: f.content,
        size: Buffer.byteLength(f.content, 'utf-8'),
      })),
      ...otherFiles.filter(f => !mutationResult.newFiles.some(nf => nf.path === f.path)),
    ]
    const newCommitSha = await createVersion(
      skillRepo.gitRepoPath,
      allFiles,
      `optimizer: ${mode} mutation`
    )

    // Create the version record in DB
    const newVersion = await prisma.skillVersion.create({
      data: {
        skillRepoId,
        gitCommitSha: newCommitSha,
        commitMessage: `optimizer: ${mode} mutation`,
        parentVersionId,
      },
    })

    // Compute diff
    const patchDiff = computeSimpleDiff(skillContent, mutationResult.newSkillContent)

    // Create candidate record
    const candidate = await prisma.optimizerCandidate.create({
      data: {
        optimizerRunId,
        parentVersionId,
        candidateVersionId: newVersion.id,
        mutationType: mode,
        rationale: mutationResult.rationale,
        patchDiff,
        status: 'running',
      },
    })

    // Store mutation details
    for (const mutation of mutationResult.mutations) {
      await prisma.optimizerMutation.create({
        data: {
          candidateId: candidate.id,
          operator: mutation.operator,
          target: mutation.target,
          beforeSnippet: mutation.beforeSnippet,
          afterSnippet: mutation.afterSnippet,
        },
      })
    }

    return { id: candidate.id, candidateVersionId: newVersion.id }
  } catch (err) {
    // Create candidate record with crash status
    const errorMsg = err instanceof Error ? err.message : String(err)
    await prisma.optimizerCandidate.create({
      data: {
        optimizerRunId,
        parentVersionId,
        mutationType: mode,
        rationale: '',
        status: 'crash',
        error: errorMsg,
      },
    })
    return null
  }
}

/**
 * Evaluate a skill version against a set of eval suites.
 * Returns aggregated metrics.
 */
async function evaluateCandidate(
  _candidateId: string | null,
  skillRepoId: string,
  versionId: string | null,
  suiteIds: string[]
): Promise<EvalMetrics> {
  if (!versionId || suiteIds.length === 0) {
    return defaultMetrics()
  }

  // Check for existing completed runs for this version+suite combination
  const existingRuns = await prisma.evalRun.findMany({
    where: {
      skillVersionId: versionId,
      suiteId: { in: suiteIds },
      status: 'completed',
    },
    orderBy: { createdAt: 'desc' },
    select: { metricsJson: true },
  })

  if (existingRuns.length > 0) {
    return aggregateMetrics(existingRuns.map(r => JSON.parse(r.metricsJson || '{}')))
  }

  // No existing runs — create and start eval runs
  const runs = []
  for (const suiteId of suiteIds) {
    const evalRun = await prisma.evalRun.create({
      data: {
        skillRepoId,
        skillVersionId: versionId,
        suiteId,
        executorType: 'mock',
        status: 'queued',
      },
    })

    // Run eval directly (not via job queue) to avoid deadlock —
    // the optimizer itself runs as a job, so enqueuing eval-run jobs
    // would never be processed while the optimizer job holds the lock.
    try {
      const { handleEvalRunJob } = await import('../eval/eval-runner')
      await handleEvalRunJob({ evalRunId: evalRun.id })
    } catch {
      // If eval run fails, continue with default metrics
    }

    runs.push(evalRun)
  }

  // Re-read run results (handleEvalRunJob completes synchronously)
  const completedRuns = await prisma.evalRun.findMany({
    where: { id: { in: runs.map(r => r.id) }, status: 'completed' },
    select: { metricsJson: true },
  })

  if (completedRuns.length > 0) {
    return aggregateMetrics(completedRuns.map(r => JSON.parse(r.metricsJson || '{}')))
  }

  return defaultMetrics()
}

function aggregateMetrics(metricsArray: Record<string, unknown>[]): EvalMetrics {
  if (metricsArray.length === 0) return defaultMetrics()

  let totalPass = 0, totalFail = 0, totalDuration = 0
  let totalTokens = 0, totalCost = 0, count = 0

  for (const m of metricsArray) {
    const passCount = (m.passCount as number) || 0
    const failCount = (m.failCount as number) || 0
    totalPass += passCount
    totalFail += failCount
    totalDuration += ((m.duration as { mean?: number })?.mean || 0)
    totalTokens += ((m.tokens as { mean?: number })?.mean || 0) * (passCount + failCount)
    totalCost += ((m.cost as { total?: number })?.total || 0)
    count++
  }

  const totalCases = totalPass + totalFail
  return {
    passRate: totalCases > 0 ? totalPass / totalCases : 0,
    totalCases,
    passCount: totalPass,
    failCount: totalFail,
    avgDurationMs: count > 0 ? totalDuration / count : 0,
    totalTokens,
    totalCostUsd: totalCost,
  }
}

function defaultMetrics(): EvalMetrics {
  return {
    passRate: 0,
    totalCases: 0,
    passCount: 0,
    failCount: 0,
    avgDurationMs: 0,
    totalTokens: 0,
    totalCostUsd: 0,
  }
}

function computeSimpleDiff(before: string, after: string): string {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const diff: string[] = []

  const maxLen = Math.max(beforeLines.length, afterLines.length)
  for (let i = 0; i < maxLen; i++) {
    const bLine = beforeLines[i]
    const aLine = afterLines[i]
    if (bLine !== aLine) {
      if (bLine != null) diff.push(`- ${bLine}`)
      if (aLine != null) diff.push(`+ ${aLine}`)
    }
  }

  return diff.join('\n').slice(0, 10000) // Cap diff size
}

async function recordDecision(
  optimizerRunId: string,
  candidateId: string | null,
  decision: string,
  reason: string,
  metrics?: unknown
): Promise<void> {
  await prisma.optimizerDecision.create({
    data: {
      optimizerRunId,
      candidateId,
      decision,
      reason,
      metricsJson: metrics ? JSON.stringify(metrics) : '{}',
    },
  })
}
