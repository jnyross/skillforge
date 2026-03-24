import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { executeBaseline } from '@/lib/services/eval/baseline-service'
import { compareBlind } from '@/lib/services/eval/blind-comparator'
import type { ExecutorConfig } from '@/lib/services/executor/types'

/**
 * GET /api/eval-runs/[id]/compare
 * Returns all blind comparisons for an eval run.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const comparisons = await prisma.blindComparison.findMany({
    where: { evalRunId: id },
    include: {
      evalCaseRun: {
        include: {
          evalCase: { select: { id: true, name: true, prompt: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Compute aggregate stats
  const totalComparisons = comparisons.length
  const skillWins = comparisons.filter(c => c.winner === 'skill').length
  const baselineWins = comparisons.filter(c => c.winner === 'baseline').length
  const ties = comparisons.filter(c => c.winner === 'TIE').length
  const avgDelta = totalComparisons > 0
    ? comparisons.reduce((sum, c) => sum + c.delta, 0) / totalComparisons
    : 0
  const avgSkillScore = totalComparisons > 0
    ? comparisons.reduce((sum, c) => sum + c.skillScore, 0) / totalComparisons
    : 0
  const avgBaselineScore = totalComparisons > 0
    ? comparisons.reduce((sum, c) => sum + c.baselineScore, 0) / totalComparisons
    : 0

  return NextResponse.json({
    comparisons,
    summary: {
      totalComparisons,
      skillWins,
      baselineWins,
      ties,
      avgDelta: Math.round(avgDelta * 100) / 100,
      avgSkillScore: Math.round(avgSkillScore * 100) / 100,
      avgBaselineScore: Math.round(avgBaselineScore * 100) / 100,
      skillWinRate: totalComparisons > 0
        ? Math.round((skillWins / totalComparisons) * 100)
        : 0,
    },
  })
}

/**
 * POST /api/eval-runs/[id]/compare
 * Runs blind comparisons for all output cases in an eval run.
 * For each case: executes baseline (no skill), then runs blind comparison.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: evalRunId } = await params

  // Load the eval run with case runs
  const evalRun = await prisma.evalRun.findUnique({
    where: { id: evalRunId },
    include: {
      caseRuns: {
        include: {
          evalCase: true,
        },
      },
    },
  })

  if (!evalRun) {
    return NextResponse.json({ error: 'Eval run not found' }, { status: 404 })
  }

  if (evalRun.status !== 'completed') {
    return NextResponse.json(
      { error: 'Eval run must be completed before running comparisons' },
      { status: 400 }
    )
  }

  // Check if comparisons already exist
  const existingComparisons = await prisma.blindComparison.count({
    where: { evalRunId },
  })
  if (existingComparisons > 0) {
    return NextResponse.json(
      { error: 'Comparisons already exist for this eval run. Delete them first to re-run.' },
      { status: 409 }
    )
  }

  const executorConfig: ExecutorConfig & { type?: string } = {
    model: evalRun.model,
    effort: evalRun.effort as ExecutorConfig['effort'],
    maxTurns: evalRun.maxTurns,
    permissionMode: evalRun.permissionMode as ExecutorConfig['permissionMode'],
    type: evalRun.executorType,
  }

  const results: Array<{ caseRunId: string; winner: string; delta: number }> = []

  for (const caseRun of evalRun.caseRuns) {
    // Skip trigger cases or errored cases
    if (caseRun.status === 'error' || !caseRun.evalCase) {
      continue
    }

    try {
      // Parse skill output from case run
      const skillOutputJson = JSON.parse(caseRun.outputJson || '{}') as { result?: string }
      const skillOutput = skillOutputJson.result || ''

      if (!skillOutput) {
        continue
      }

      // Execute baseline (same prompt, no skill)
      const baselineOutput = await executeBaseline(
        caseRun.evalCase.prompt,
        executorConfig
      )

      // Check if baseline execution failed
      if (baselineOutput.isError) {
        // Store the error but skip comparison
        await prisma.evalCaseRun.update({
          where: { id: caseRun.id },
          data: {
            baselineOutputJson: JSON.stringify({
              result: baselineOutput.result.slice(0, 50000),
              durationMs: baselineOutput.durationMs,
              costUsd: baselineOutput.costUsd,
              model: baselineOutput.model,
              isError: true,
            }),
          },
        })
        results.push({
          caseRunId: caseRun.id,
          winner: 'error: baseline execution failed',
          delta: 0,
        })
        continue
      }

      // Store baseline output on the case run
      await prisma.evalCaseRun.update({
        where: { id: caseRun.id },
        data: {
          baselineOutputJson: JSON.stringify({
            result: baselineOutput.result.slice(0, 50000),
            durationMs: baselineOutput.durationMs,
            costUsd: baselineOutput.costUsd,
            model: baselineOutput.model,
            isError: baselineOutput.isError,
          }),
        },
      })

      // Randomly assign A/B labels for blind comparison
      const skillIsA = Math.random() >= 0.5

      // Run blind comparison
      const comparison = await compareBlind({
        outputA: skillIsA ? skillOutput : baselineOutput.result,
        outputB: skillIsA ? baselineOutput.result : skillOutput,
        evalPrompt: caseRun.evalCase.prompt,
        expectations: caseRun.evalCase.expectedOutcome
          ? [caseRun.evalCase.expectedOutcome]
          : undefined,
        skillIsA,
      })

      // Compute unblinded scores
      const skillScore = skillIsA
        ? comparison.rubric.A.overall_score
        : comparison.rubric.B.overall_score
      const baselineScore = skillIsA
        ? comparison.rubric.B.overall_score
        : comparison.rubric.A.overall_score

      // Persist comparison
      await prisma.blindComparison.create({
        data: {
          evalCaseRunId: caseRun.id,
          evalRunId,
          winner: comparison.winnerLabel,
          skillIsA: comparison.skillIsA,
          delta: comparison.delta,
          reasoningText: comparison.reasoning,
          rubricJson: JSON.stringify(comparison.rubric),
          outputQualityJson: JSON.stringify(comparison.output_quality),
          expectationResultsJson: comparison.expectation_results
            ? JSON.stringify(comparison.expectation_results)
            : '{}',
          skillScore,
          baselineScore,
        },
      })

      results.push({
        caseRunId: caseRun.id,
        winner: comparison.winnerLabel,
        delta: comparison.delta,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      results.push({
        caseRunId: caseRun.id,
        winner: `error: ${errorMsg}`,
        delta: 0,
      })
    }
  }

  // Compute aggregate summary
  const validResults = results.filter(r => !r.winner.startsWith('error:'))
  const skillWins = validResults.filter(r => r.winner === 'skill').length
  const baselineWins = validResults.filter(r => r.winner === 'baseline').length
  const ties = validResults.filter(r => r.winner === 'TIE').length
  const avgDelta = validResults.length > 0
    ? validResults.reduce((s, r) => s + r.delta, 0) / validResults.length
    : 0

  return NextResponse.json({
    results,
    summary: {
      totalComparisons: validResults.length,
      skillWins,
      baselineWins,
      ties,
      avgDelta: Math.round(avgDelta * 100) / 100,
      skillWinRate: validResults.length > 0
        ? Math.round((skillWins / validResults.length) * 100)
        : 0,
    },
  }, { status: 201 })
}

/**
 * DELETE /api/eval-runs/[id]/compare
 * Deletes all blind comparisons for an eval run so they can be re-run.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: evalRunId } = await params

  const deleted = await prisma.blindComparison.deleteMany({
    where: { evalRunId },
  })

  return NextResponse.json({
    deleted: deleted.count,
    message: `Deleted ${deleted.count} comparison(s). You can now re-run comparisons.`,
  })
}
