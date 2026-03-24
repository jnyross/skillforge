/**
 * Eval runner orchestrator.
 * Executes eval suites against skill versions using the executor adapter.
 *
 * Responsibilities:
 * 1. Load eval suite and cases from DB
 * 2. Create workspace with skill files materialized
 * 3. Execute each case using the executor
 * 4. Run assertions against outputs
 * 5. Persist traces, artifacts, and assertion results
 * 6. Compute and store benchmark snapshots
 */

import { prisma } from '@/lib/prisma'
import { createWorkspace, captureArtifacts } from '../workspace'
import { createExecutor } from '../executor'
import { runAssertions, type AssertionDefinition } from './assertion-engine'
import { detectTrigger, computeTriggerMetrics, type TriggerCase, type TriggerRunResult } from './trigger-engine'
import { computeBenchmarkSummary, computeBaselineComparison, computeSuiteAnalysis, type CaseResult } from './benchmark-math'
import { logAuditEvent } from '../audit-log'
import type { ExecutorConfig } from '../executor/types'

/**
 * Main eval run handler. Called by the job queue when an eval-run job is processed.
 */
export async function handleEvalRunJob(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const evalRunId = payload.evalRunId as string
  if (!evalRunId) {
    throw new Error('evalRunId is required in job payload')
  }

  const evalRun = await prisma.evalRun.findUnique({
    where: { id: evalRunId },
    include: {
      suite: {
        include: {
          cases: {
            include: { fixtures: true },
          },
        },
      },
      skillVersion: true,
      skillRepo: true,
      baselineVersion: true,
    },
  })

  if (!evalRun) {
    throw new Error(`Eval run ${evalRunId} not found`)
  }

  if (evalRun.status === 'cancelled') {
    return { status: 'cancelled' }
  }

  if (evalRun.status !== 'queued') {
    return { status: 'skipped', reason: `Run is already in '${evalRun.status}' status` }
  }

  // Mark as running
  await prisma.evalRun.update({
    where: { id: evalRunId },
    data: { status: 'running', startedAt: new Date() },
  })

  await logAuditEvent({
    action: 'eval_run.started',
    entityType: 'eval_run',
    entityId: evalRunId,
    details: {
      suiteId: evalRun.suiteId,
      skillVersionId: evalRun.skillVersionId,
      executorType: evalRun.executorType,
    },
  })

  try {
    const repoPath = evalRun.skillRepo.gitRepoPath
    const executor = createExecutor(evalRun.executorType as 'claude-cli' | 'mock')
    const executorConfig: ExecutorConfig = {
      model: evalRun.model,
      effort: evalRun.effort as ExecutorConfig['effort'],
      maxTurns: evalRun.maxTurns,
      permissionMode: evalRun.permissionMode as ExecutorConfig['permissionMode'],
    }

    const isTriggerSuite = evalRun.suite.type === 'trigger'
    // Apply split filter (PR 6: holdout protection)
    const splitFilter = (evalRun.splitFilter || 'all') as string
    const allCases = evalRun.suite.cases
    const cases = splitFilter === 'all'
      ? allCases
      : allCases.filter(c => {
          const allowedSplits = splitFilter.split('+').map(s => s.trim())
          return allowedSplits.includes(c.split)
        })
    const caseResults: CaseResult[] = []
    const triggerResults: TriggerRunResult[] = []

    // Execute each case
    for (const evalCase of cases) {
      // Check if cancelled mid-run
      const currentRun = await prisma.evalRun.findUnique({
        where: { id: evalRunId },
        select: { status: true },
      })
      if (currentRun?.status === 'cancelled') {
        break
      }

      try {
        if (isTriggerSuite) {
          const triggerResult = await executeTriggerCase(
            evalRunId,
            evalCase,
            repoPath,
            evalRun.skillVersion.gitCommitSha,
            executor,
            executorConfig,
            3 // default repeat count
          )
          triggerResults.push(triggerResult)

          caseResults.push({
            caseId: evalCase.id,
            passed: triggerResult.passed,
            durationMs: triggerResult.runs.reduce((s, r) => s + r.durationMs, 0),
            tokenCount: 0,
            costUsd: 0,
            tags: evalCase.tags ? evalCase.tags.split(',').map(t => t.trim()) : [],
          })
        } else {
          const caseResult = await executeOutputCase(
            evalRunId,
            evalCase,
            repoPath,
            evalRun.skillVersion.gitCommitSha,
            executor,
            executorConfig
          )
          caseResults.push(caseResult)
        }
      } catch (err) {
        // Record case failure but continue with other cases
        const errorMsg = err instanceof Error ? err.message : String(err)
        await prisma.evalCaseRun.create({
          data: {
            evalRunId,
            evalCaseId: evalCase.id,
            skillVersionId: evalRun.skillVersionId,
            status: 'error',
            error: errorMsg,
          },
        })

        caseResults.push({
          caseId: evalCase.id,
          passed: false,
          durationMs: 0,
          tokenCount: 0,
          costUsd: 0,
          tags: evalCase.tags ? evalCase.tags.split(',').map(t => t.trim()) : [],
        })
      }
    }

    // Compute metrics
    const summary = computeBenchmarkSummary(caseResults)
    let metricsJson: Record<string, unknown> = { ...summary }

    // Add trigger-specific metrics if applicable
    if (isTriggerSuite) {
      const triggerCases: TriggerCase[] = cases.map(c => ({
        id: c.id,
        query: c.prompt,
        shouldTrigger: c.shouldTrigger ?? true,
        tags: c.tags,
        split: c.split as TriggerCase['split'],
      }))
      const triggerMetrics = computeTriggerMetrics(triggerResults, triggerCases)
      metricsJson = { ...metricsJson, trigger: triggerMetrics }
    }

    // Run baseline comparison if baseline version is set
    if (evalRun.baselineVersionId) {
      // Find the most recent completed eval run for the baseline version+suite
      const baselineRun = await prisma.evalRun.findFirst({
        where: {
          skillVersionId: evalRun.baselineVersionId,
          suiteId: evalRun.suiteId,
          status: 'completed',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })

      const baselineCaseRuns = baselineRun
        ? await prisma.evalCaseRun.findMany({
            where: { evalRunId: baselineRun.id },
            include: { assertions: true },
            orderBy: { createdAt: 'desc' },
          })
        : []

      if (baselineCaseRuns.length > 0) {
        const baselineResults: CaseResult[] = baselineCaseRuns.map(cr => ({
          caseId: cr.evalCaseId,
          passed: cr.status === 'passed',
          durationMs: cr.durationMs ?? 0,
          tokenCount: (() => { try { const u = JSON.parse(cr.tokenUsage); return (u.inputTokens ?? 0) + (u.outputTokens ?? 0) } catch { return 0 } })(),
          costUsd: cr.costUsd ?? 0,
          tags: [],
        }))
        const comparison = computeBaselineComparison(caseResults, baselineResults)
        metricsJson = { ...metricsJson, baseline: comparison }
      }
    }

    // Compute suite analysis from case runs
    const caseRunsForAnalysis = await prisma.evalCaseRun.findMany({
      where: { evalRunId },
      include: { assertions: true },
    })
    if (caseRunsForAnalysis.length > 0) {
      const suiteAnalysis = computeSuiteAnalysis(
        caseRunsForAnalysis.map(cr => ({
          passed: cr.status === 'passed',
          durationMs: cr.durationMs ?? 0,
          assertions: cr.assertions.map(a => ({
            type: a.type,
            description: a.name,
            passed: a.passed,
          })),
        }))
      )
      metricsJson = { ...metricsJson, suiteAnalysis }
    }

    // Store benchmark snapshot
    await prisma.benchmarkSnapshot.create({
      data: {
        skillRepoId: evalRun.skillRepoId,
        evalRunId,
        totalCases: summary.totalCases,
        passedCases: summary.passCount,
        failedCases: summary.failCount,
        passRate: summary.passRate,
        avgDurationMs: summary.duration.mean,
        totalCostUsd: summary.cost.total,
        metricsJson: JSON.stringify(metricsJson),
      },
    })

    // Mark as completed
    await prisma.evalRun.update({
      where: { id: evalRunId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        metricsJson: JSON.stringify(metricsJson),
      },
    })

    await logAuditEvent({
      action: 'eval_run.completed',
      entityType: 'eval_run',
      entityId: evalRunId,
      details: {
        passRate: summary.passRate,
        totalCases: summary.totalCases,
        passCount: summary.passCount,
        failCount: summary.failCount,
      },
    })

    return { status: 'completed', metrics: metricsJson }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)

    await prisma.evalRun.update({
      where: { id: evalRunId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        error: errorMsg,
      },
    })

    await logAuditEvent({
      action: 'eval_run.failed',
      entityType: 'eval_run',
      entityId: evalRunId,
      details: { error: errorMsg },
    })

    throw err
  }
}

/**
 * Execute a single trigger eval case with repeated runs.
 */
async function executeTriggerCase(
  evalRunId: string,
  evalCase: {
    id: string
    prompt: string
    shouldTrigger: boolean | null
    fixtures: Array<{ name: string; type: string; content: string; path: string }>
  },
  repoPath: string,
  commitSha: string,
  executor: ReturnType<typeof createExecutor>,
  config: ExecutorConfig,
  repeatCount: number
): Promise<TriggerRunResult> {
  const runs: TriggerRunResult['runs'] = []

  for (let i = 0; i < repeatCount; i++) {
    const { workspacePath, cleanup } = await createWorkspace({
      repoPath,
      commitSha,
      fixtures: evalCase.fixtures.map(f => ({
        path: f.path || f.name,
        content: f.content,
        type: f.type,
      })),
    })

    try {
      const output = await executor.execute({
        prompt: evalCase.prompt,
        workspacePath,
        config,
      })

      const detection = detectTrigger(output.result)

      // Create trace before pushing to runs so failure doesn't cause duplicate entry
      await createTrace(evalRunId, evalCase.id, output, workspacePath)

      runs.push({
        triggered: detection.triggered,
        confidence: detection.confidence,
        durationMs: output.durationMs,
      })
    } catch (err) {
      runs.push({
        triggered: false,
        confidence: 0,
        durationMs: 0,
      })
    } finally {
      await cleanup()
    }
  }

  const triggerRate = runs.filter(r => r.triggered).length / runs.length
  const shouldTrigger = evalCase.shouldTrigger ?? true

  const result: TriggerRunResult = {
    caseId: evalCase.id,
    query: evalCase.prompt,
    shouldTrigger,
    runs,
    triggerRate,
    passed: shouldTrigger ? triggerRate >= 0.5 : triggerRate < 0.5,
  }

  // Store case run
  await prisma.evalCaseRun.create({
    data: {
      evalRunId,
      evalCaseId: evalCase.id,
      skillVersionId: (await prisma.evalRun.findUnique({
        where: { id: evalRunId },
        select: { skillVersionId: true },
      }))!.skillVersionId,
      status: result.passed ? 'passed' : 'failed',
      triggerResult: triggerRate >= 0.5,
      durationMs: runs.reduce((s, r) => s + r.durationMs, 0),
      outputJson: JSON.stringify(result),
    },
  })

  return result
}

/**
 * Execute a single output/workflow eval case.
 */
async function executeOutputCase(
  evalRunId: string,
  evalCase: {
    id: string
    prompt: string
    expectedOutcome: string
    configJson: string
    tags: string
    fixtures: Array<{ name: string; type: string; content: string; path: string }>
  },
  repoPath: string,
  commitSha: string,
  executor: ReturnType<typeof createExecutor>,
  config: ExecutorConfig
): Promise<CaseResult> {
  const { workspacePath, cleanup } = await createWorkspace({
    repoPath,
    commitSha,
    fixtures: evalCase.fixtures.map(f => ({
      path: f.path || f.name,
      content: f.content,
      type: f.type,
    })),
  })

  try {
    const output = await executor.execute({
      prompt: evalCase.prompt,
      workspacePath,
      config,
    })

    // Capture artifacts from workspace
    const artifacts = await captureArtifacts(workspacePath)

    // Create trace
    const trace = await createTrace(evalRunId, evalCase.id, output, workspacePath, artifacts)

    // Parse assertions from case config
    const caseConfig = JSON.parse(evalCase.configJson || '{}') as {
      assertions?: AssertionDefinition[]
      semanticAssertions?: Array<{
        type: string
        description: string
        criterion: string
        dimension: string
        discriminating_note?: string
      }>
    }
    const assertions = caseConfig.assertions ?? []

    // PR 3: Add semantic assertions from config
    // PR B3: Check for programmatic equivalents first to avoid unnecessary LLM calls
    if (caseConfig.semanticAssertions && caseConfig.semanticAssertions.length > 0) {
      const { detectProgrammaticAssertion } = await import('./semantic-grader')
      for (const sa of caseConfig.semanticAssertions) {
        const programmatic = detectProgrammaticAssertion({
          type: 'semantic',
          description: sa.description,
          criterion: sa.criterion,
          dimension: sa.dimension as 'structure' | 'content' | 'quality' | 'format',
          discriminating_note: sa.discriminating_note,
        })

        if (programmatic && programmatic.script) {
          // Use deterministic programmatic assertion instead of LLM
          assertions.push({
            type: 'programmatic',
            target: programmatic.target,
            expected: programmatic.expected,
            options: {
              script: programmatic.script,
              description: sa.description,
            },
          })
        } else {
          // Fall back to semantic (LLM) grading
          assertions.push({
            type: 'semantic',
            options: {
              description: sa.description,
              criterion: sa.criterion,
              dimension: sa.dimension,
              discriminating_note: sa.discriminating_note,
              prompt: evalCase.prompt,
            },
          })
        }
      }
    }

    // If no explicit assertions but there's an expected outcome, add a contains check
    if (assertions.length === 0 && evalCase.expectedOutcome) {
      assertions.push({
        type: 'contains',
        expected: evalCase.expectedOutcome,
      })
    }

    // PR 2: If eval case has a judge assigned, add a judge assertion
    if ('judgeId' in evalCase && evalCase.judgeId) {
      assertions.push({
        type: 'judge',
        options: {
          judgeId: evalCase.judgeId as string,
          prompt: evalCase.prompt,
          expectedOutcome: evalCase.expectedOutcome,
        },
      })
    }

    // Run assertions
    const assertionResults = await runAssertions(assertions, {
      workspacePath,
      stdout: output.result,
      stderr: '',
      result: output.result,
    })

    // Store assertion results in DB
    const skillVersionId = (await prisma.evalRun.findUnique({
      where: { id: evalRunId },
      select: { skillVersionId: true },
    }))!.skillVersionId

    const caseRun = await prisma.evalCaseRun.create({
      data: {
        evalRunId,
        evalCaseId: evalCase.id,
        skillVersionId,
        traceId: trace.id,
        status: assertionResults.passed ? 'passed' : 'failed',
        durationMs: output.durationMs,
        tokenUsage: JSON.stringify(output.usage ?? {}),
        costUsd: output.costUsd ?? null,
        outputJson: JSON.stringify({
          result: output.result.slice(0, 10000),
          isError: output.isError,
          stopReason: output.stopReason,
        }),
      },
    })

    // Store individual assertion results (with semantic grading structured data)
    const allClaimsForCase: unknown[] = []
    const allEvalSuggestionsForCase: unknown[] = []

    for (const ar of assertionResults.results) {
      // Use structured semantic data directly from the assertion result (no regex parsing)
      const isSemantic = ar.type === 'semantic'
      const claimsJson = isSemantic && ar.semanticClaimsJson ? ar.semanticClaimsJson : '[]'
      const evalFeedbackJson = isSemantic && ar.semanticEvalFeedbackJson ? ar.semanticEvalFeedbackJson : '{}'

      // Collect claims and suggestions for case-level aggregation
      if (isSemantic) {
        try { allClaimsForCase.push(...JSON.parse(claimsJson) as unknown[]) } catch { /* ignore */ }
        try {
          const feedback = JSON.parse(evalFeedbackJson) as { suggestions?: unknown[] }
          if (feedback.suggestions) allEvalSuggestionsForCase.push(...feedback.suggestions)
        } catch { /* ignore */ }
      }

      await prisma.assertionResult.create({
        data: {
          evalCaseRunId: caseRun.id,
          name: ar.type,
          type: ar.type,
          passed: ar.passed,
          expected: ar.expected != null ? String(ar.expected) : '',
          actual: ar.actual != null ? String(ar.actual) : '',
          message: ar.evidence,
          durationMs: ar.durationMs,
          evidence: isSemantic ? (ar.semanticEvidence || '') : '',
          reasoning: isSemantic ? (ar.semanticReasoning || '') : '',
          confidence: isSemantic ? (ar.semanticConfidence ?? null) : null,
          dimension: isSemantic ? (ar.semanticDimension || '') : '',
          claimsJson,
          evalFeedbackJson,
        },
      })
    }

    // Update case run with aggregated claims and eval feedback from semantic assertions
    if (allClaimsForCase.length > 0 || allEvalSuggestionsForCase.length > 0) {
      await prisma.evalCaseRun.update({
        where: { id: caseRun.id },
        data: {
          allClaimsJson: JSON.stringify(allClaimsForCase),
          evalFeedbackJson: JSON.stringify({
            suggestions: allEvalSuggestionsForCase,
            overall: allEvalSuggestionsForCase.length > 0
              ? `${allEvalSuggestionsForCase.length} suggestion(s) for improving eval assertions.`
              : 'No suggestions, evals look solid.',
          }),
        },
      })
    }

    const tags = evalCase.tags ? evalCase.tags.split(',').map(t => t.trim()) : []

    return {
      caseId: evalCase.id,
      passed: assertionResults.passed,
      durationMs: output.durationMs,
      tokenCount: output.usage
        ? output.usage.inputTokens + output.usage.outputTokens
        : 0,
      costUsd: output.costUsd ?? 0,
      tags,
      assertionResults: assertionResults.results.map(ar => ({
        type: ar.type,
        passed: ar.passed,
      })),
    }
  } finally {
    await cleanup()
  }
}

/**
 * Create a trace record with tool events and artifacts.
 */
async function createTrace(
  evalRunId: string,
  _evalCaseId: string,
  output: {
    sessionId: string
    result: string
    isError: boolean
    durationMs: number
    costUsd?: number
    model?: string
    usage?: { inputTokens: number; outputTokens: number }
    toolEvents?: Array<{ toolName: string; input: string; output: string }>
    artifacts?: Array<{ name: string; type: string; content: string; path?: string }>
  },
  workspacePath: string,
  capturedArtifacts?: Array<{ name: string; type: string; content: string; path: string; sizeBytes: number }>
) {
  const run = await prisma.evalRun.findUnique({
    where: { id: evalRunId },
    select: { skillVersionId: true },
  })

  const trace = await prisma.trace.create({
    data: {
      evalRunId,
      skillVersionId: run?.skillVersionId,
      sessionId: output.sessionId,
      model: output.model ?? '',
      prompt: '',
      totalDurationMs: output.durationMs,
      totalCostUsd: output.costUsd ?? null,
      totalTokens: output.usage
        ? output.usage.inputTokens + output.usage.outputTokens
        : null,
      inputTokens: output.usage?.inputTokens ?? null,
      outputTokens: output.usage?.outputTokens ?? null,
      status: output.isError ? 'failed' : 'completed',
      resultJson: JSON.stringify({
        result: output.result.slice(0, 50000),
        isError: output.isError,
      }),
      completedAt: new Date(),
    },
  })

  // Store tool events
  if (output.toolEvents && output.toolEvents.length > 0) {
    for (let i = 0; i < output.toolEvents.length; i++) {
      const event = output.toolEvents[i]
      await prisma.toolEvent.create({
        data: {
          traceId: trace.id,
          toolName: event.toolName,
          input: event.input,
          output: event.output,
          sequence: i,
        },
      })
    }
  }

  // Store artifacts
  const allArtifacts = [
    ...(output.artifacts ?? []).map(a => ({
      name: a.name,
      type: a.type,
      content: a.content,
      path: a.path ?? a.name,
      sizeBytes: Buffer.byteLength(a.content, 'utf-8'),
    })),
    ...(capturedArtifacts ?? []),
  ]

  for (const artifact of allArtifacts) {
    await prisma.runArtifact.create({
      data: {
        traceId: trace.id,
        name: artifact.name,
        type: artifact.type,
        content: artifact.content.slice(0, 500000), // Cap at 500KB
        path: artifact.path,
        sizeBytes: artifact.sizeBytes,
      },
    })
  }

  // Store stdout as log chunk
  if (output.result) {
    await prisma.logChunk.create({
      data: {
        traceId: trace.id,
        stream: 'stdout',
        content: output.result.slice(0, 100000),
        sequence: 0,
      },
    })
  }

  return trace
}

/**
 * Start an eval run by enqueuing it as a job.
 */
export async function startEvalRun(evalRunId: string): Promise<string> {
  const { enqueueJob } = await import('../job-queue')

  const jobId = await enqueueJob('eval-run', { evalRunId })

  await prisma.evalRun.update({
    where: { id: evalRunId },
    data: { jobId },
  })

  return jobId
}
