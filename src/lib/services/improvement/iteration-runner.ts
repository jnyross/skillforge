/**
 * Iteration Runner — Orchestrates one complete improvement iteration.
 *
 * Flow: execute eval -> grade -> compare (blind) -> analyze -> suggest
 *
 * Key constraints:
 * - Runs ONE iteration, not an unbounded loop
 * - User must review and accept/reject suggestions
 * - Does NOT auto-promote — user clicks "Apply" after reviewing
 */

import { prisma } from '@/lib/prisma'
import { analyzeComparison } from './analyzer-service'
import type { AnalysisResult } from './analyzer-service'
import { handleEvalRunJob } from '../eval/eval-runner'
import { executeBaseline } from '../eval/baseline-service'
import { compareBlind } from '../eval/blind-comparator'
import { getFilesAtCommit } from '../git-storage'
import type { ExecutorConfig } from '../executor/types'

// --- Types ---

export interface IterationInput {
  skillRepoId: string
  skillVersionId: string
  /** Which eval suite to use for this iteration */
  evalSuiteId: string
  /** Executor configuration */
  executorConfig: ExecutorConfig
  /** Pre-created iteration ID (from route handler). If provided, uses this record instead of creating a new one. */
  iterationId?: string
}

export interface IterationResult {
  iterationId: string
  status: 'completed' | 'failed'
  /** Pass rate from the eval run */
  passRate: number | null
  /** Skill win rate from blind comparison */
  skillWinRate: number | null
  /** Average delta (skill - baseline) */
  avgDelta: number | null
  /** Full analysis from analyzer agent */
  analysis: AnalysisResult | null
  error?: string
}

// --- Main ---

/**
 * Run one complete improvement iteration.
 * Steps: eval -> baseline -> compare -> analyze -> suggest
 */
export async function runIteration(input: IterationInput): Promise<IterationResult> {
  let iterationId: string

  if (input.iterationId) {
    // Use the pre-created iteration record from the route handler
    iterationId = input.iterationId
    await prisma.improvementIteration.update({
      where: { id: iterationId },
      data: { status: 'running' },
    })
  } else {
    // Create a new iteration record (standalone usage)
    const latestIteration = await prisma.improvementIteration.findFirst({
      where: { skillRepoId: input.skillRepoId, sourceVersionId: input.skillVersionId },
      orderBy: { iterationNumber: 'desc' },
      select: { iterationNumber: true },
    })
    const iterationNumber = (latestIteration?.iterationNumber ?? 0) + 1
    const iteration = await prisma.improvementIteration.create({
      data: {
        skillRepoId: input.skillRepoId,
        sourceVersionId: input.skillVersionId,
        iterationNumber,
        status: 'running',
      },
    })
    iterationId = iteration.id
  }

  try {
    // Step 1: Create and run eval

    const evalRun = await prisma.evalRun.create({
      data: {
        suiteId: input.evalSuiteId,
        skillRepoId: input.skillRepoId,
        skillVersionId: input.skillVersionId,
        executorType: 'claude-cli',
        model: input.executorConfig.model ?? 'claude-opus-4-6',
        effort: input.executorConfig.effort ?? 'high',
        maxTurns: input.executorConfig.maxTurns ?? 10,
        permissionMode: input.executorConfig.permissionMode ?? 'auto',
        status: 'queued',
        splitFilter: 'train+validation',
      },
    })

    // Run the eval
    await handleEvalRunJob({ evalRunId: evalRun.id })

    // Reload eval run to get results
    const completedRun = await prisma.evalRun.findUniqueOrThrow({
      where: { id: evalRun.id },
      include: {
        caseRuns: {
          include: {
            evalCase: true,
          },
        },
      },
    })

    const passRate = completedRun.caseRuns.length > 0
      ? completedRun.caseRuns.filter(cr => cr.status === 'passed').length / completedRun.caseRuns.length
      : 0

    // Update iteration with eval results
    await prisma.improvementIteration.update({
      where: { id: iterationId },
      data: { evalRunId: evalRun.id, passRate },
    })

    // Step 2: Run baseline + blind comparison on a subset of cases
    const outputCaseRuns = completedRun.caseRuns.filter(
      cr => cr.evalCase.shouldTrigger === null
    )

    let skillWinRate: number | null = null
    let avgDelta: number | null = null
    const comparisonResults: Array<{ winner: string; delta: number }> = []
    // Track which case runs were actually used for comparison (Bug fix: avoid mismatch with outputCaseRuns[0])
    const comparedCaseRuns: typeof outputCaseRuns = []

    if (outputCaseRuns.length > 0) {
      // Run baseline and comparison on up to 3 cases (to save cost)
      const casesToCompare = outputCaseRuns.slice(0, 3)

      for (const caseRun of casesToCompare) {
        try {
          // Get skill output from case run
          const skillOutputJson = caseRun.outputJson ? JSON.parse(caseRun.outputJson) as { result?: string } : null
          const skillOutput = skillOutputJson?.result || ''

          if (!skillOutput) continue

          // Run baseline
          const baselineOutput = await executeBaseline(
            caseRun.evalCase.prompt,
            input.executorConfig
          )

          if (baselineOutput.isError) continue

          // Blind comparison
          const skillIsA = Math.random() > 0.5
          const comparison = await compareBlind({
            outputA: skillIsA ? skillOutput : baselineOutput.result,
            outputB: skillIsA ? baselineOutput.result : skillOutput,
            evalPrompt: caseRun.evalCase.prompt,
            expectations: caseRun.evalCase.expectedOutcome
              ? [caseRun.evalCase.expectedOutcome]
              : undefined,
            skillIsA,
          })

          comparisonResults.push({
            winner: comparison.winnerLabel,
            delta: comparison.delta,
          })
          comparedCaseRuns.push(caseRun)

          // Store baseline output on case run
          await prisma.evalCaseRun.update({
            where: { id: caseRun.id },
            data: {
              baselineOutputJson: JSON.stringify({
                result: baselineOutput.result.slice(0, 50000),
                durationMs: baselineOutput.durationMs,
                costUsd: baselineOutput.costUsd,
                model: baselineOutput.model,
                isError: false,
              }),
            },
          })
        } catch {
          // Skip failed comparisons
        }
      }

      if (comparisonResults.length > 0) {
        skillWinRate = comparisonResults.filter(r => r.winner === 'skill').length / comparisonResults.length
        avgDelta = comparisonResults.reduce((sum, r) => sum + r.delta, 0) / comparisonResults.length
      }
    }

    // Update iteration with comparison results
    await prisma.improvementIteration.update({
      where: { id: iterationId },
      data: {
        skillWinRate,
        avgDelta,
        status: 'analyzing',
      },
    })

    // Step 3: Run analyzer agent
    let analysis: AnalysisResult | null = null

    if (comparisonResults.length > 0 && outputCaseRuns.length > 0) {
      // Get skill content for analysis
      const skillRepo = await prisma.skillRepo.findUniqueOrThrow({
        where: { id: input.skillRepoId },
      })
      const skillVersion = await prisma.skillVersion.findUniqueOrThrow({
        where: { id: input.skillVersionId },
      })

      // Read skill content from git
      let skillContent = ''
      try {
        const files = await getFilesAtCommit(skillRepo.gitRepoPath, skillVersion.gitCommitSha)
        const skillFile = files.find(f => f.path === 'SKILL.md')
        skillContent = skillFile?.content || '(No SKILL.md found)'
      } catch {
        skillContent = '(Could not read SKILL.md)'
      }

      // Use the first case run that was actually compared (not outputCaseRuns[0] which may have been skipped)
      const firstCaseRun = comparedCaseRuns[0]
      const skillOutputJson = firstCaseRun.outputJson
        ? JSON.parse(firstCaseRun.outputJson) as { result?: string }
        : null
      const firstComparison = comparisonResults[0]

      // Get baseline output for analysis
      const reloadedCaseRun = await prisma.evalCaseRun.findUnique({
        where: { id: firstCaseRun.id },
        select: { baselineOutputJson: true },
      })
      const baselineJson = reloadedCaseRun?.baselineOutputJson
        ? JSON.parse(reloadedCaseRun.baselineOutputJson) as { result?: string }
        : null

      analysis = await analyzeComparison({
        comparisonResult: {
          winner: (skillWinRate ?? 0) > 0.5 ? 'skill' : (skillWinRate ?? 0) < 0.5 ? 'baseline' : 'TIE',
          reasoning: `Skill win rate: ${((skillWinRate ?? 0) * 100).toFixed(0)}%, avg delta: ${(avgDelta ?? 0).toFixed(2)}`,
          skillScore: Math.max(1, Math.min(10, 5 + (avgDelta ?? 0) / 2)),
          baselineScore: Math.max(1, Math.min(10, 5 - (avgDelta ?? 0) / 2)),
          delta: avgDelta ?? 0,
        },
        skillContent,
        skillOutput: skillOutputJson?.result || '',
        baselineOutput: baselineJson?.result || '',
        evalPrompt: firstCaseRun.evalCase.prompt,
      })
    } else {
      // No comparisons available — generate analysis from eval results only
      analysis = {
        comparison_summary: {
          winner: 'TIE',
          comparator_reasoning: 'No baseline comparison was performed (no output cases available)',
          skill_score: 0,
          baseline_score: 0,
          delta: 0,
        },
        winner_strengths: [],
        loser_weaknesses: [],
        instruction_following: {
          skill: { score: 5, issues: ['No comparison data available'] },
          baseline: { score: 5, issues: ['No comparison data available'] },
        },
        improvement_suggestions: [],
        transcript_insights: {
          skill_execution_pattern: 'No comparison data available',
          baseline_execution_pattern: 'No comparison data available',
        },
      }
    }

    // Step 4: Save analysis results and suggestions
    await prisma.improvementIteration.update({
      where: { id: iterationId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        analysisJson: JSON.stringify(analysis),
        suggestionsJson: JSON.stringify(analysis.improvement_suggestions),
      },
    })

    return {
      iterationId,
      status: 'completed',
      passRate,
      skillWinRate,
      avgDelta,
      analysis,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)

    await prisma.improvementIteration.update({
      where: { id: iterationId },
      data: {
        status: 'failed',
        error: errorMsg,
        completedAt: new Date(),
      },
    })

    return {
      iterationId,
      status: 'failed',
      passRate: null,
      skillWinRate: null,
      avgDelta: null,
      analysis: null,
      error: errorMsg,
    }
  }
}
