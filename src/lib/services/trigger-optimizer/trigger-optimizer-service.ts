/**
 * Trigger Optimizer Service.
 * Main orchestrator for the trigger description optimization pipeline.
 * Implements skill-creator's run_loop pattern:
 * 1. Generate 20 trigger eval queries
 * 2. Split into train (60%) / test (40%), stratified by shouldTrigger
 * 3. Evaluate current description
 * 4. LLM rewrites description based on failures
 * 5. Re-evaluate on both train and test
 * 6. Iterate up to 5 times
 * 7. Pick best description by TEST score (not train — prevents overfitting)
 * 8. Enforce 1024-char limit
 */

import { prisma } from '@/lib/prisma'
import { generateTriggerQueries, splitTriggerCases } from './query-generator'
import { evaluateQueries, computeAccuracy } from './trigger-evaluator'
import { improveDescription } from './description-improver'
import type { TriggerQuery } from './query-generator'
import type { PreviousAttempt } from './description-improver'

export interface OptimizationProgress {
  runId: string
  status: string
  currentIteration: number
  maxIterations: number
  bestTestScore: number
  bestTrainScore: number
  bestDescription: string
  originalDescription: string
  iterations: Array<{
    iteration: number
    description: string
    trainScore: number
    testScore: number
    improvementReason: string
  }>
}

/**
 * Start a new trigger optimization run.
 * Generates queries and performs the stratified train/test split.
 */
export async function startOptimization(
  skillRepoId: string,
  skillVersionId: string,
  skillContent: string,
  description: string,
  maxIterations: number = 5,
): Promise<string> {
  // Create the run record
  const run = await prisma.triggerOptimizationRun.create({
    data: {
      skillRepoId,
      skillVersionId,
      status: 'generating-queries',
      maxIterations,
      originalDescription: description,
      bestDescription: description,
    },
  })

  try {
    // Generate trigger queries
    const queries = await generateTriggerQueries(skillContent, description)

    // Stratified train/test split
    const { trainIndices, testIndices } = splitTriggerCases(queries)

    // Update run with queries and splits
    await prisma.triggerOptimizationRun.update({
      where: { id: run.id },
      data: {
        status: 'reviewing',
        queriesJson: JSON.stringify(queries),
        trainIndices: JSON.stringify(trainIndices),
        testIndices: JSON.stringify(testIndices),
      },
    })

    return run.id
  } catch (err) {
    await prisma.triggerOptimizationRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      },
    })
    throw err
  }
}

/**
 * Run the optimization loop (called after user reviews queries).
 * Iterates up to maxIterations, selecting best by TEST score.
 */
export async function runOptimizationLoop(
  runId: string,
  skillContent: string,
): Promise<OptimizationProgress> {
  const run = await prisma.triggerOptimizationRun.findUniqueOrThrow({
    where: { id: runId },
  })

  // Guard: only start from reviewing status
  if (run.status !== 'reviewing' && run.status !== 'generating-queries') {
    throw new Error(`Cannot start optimization: run is in '${run.status}' status (expected 'reviewing')`)
  }

  const queries: TriggerQuery[] = JSON.parse(run.queriesJson)
  const trainIndices: number[] = JSON.parse(run.trainIndices)
  const testIndices: number[] = JSON.parse(run.testIndices)

  await prisma.triggerOptimizationRun.update({
    where: { id: runId },
    data: { status: 'running' },
  })

  let currentDescription = run.originalDescription
  let bestDescription = currentDescription
  let bestTestScore = 0
  let bestTrainScore = 0
  const previousAttempts: PreviousAttempt[] = []

  try {
    for (let iter = 0; iter < run.maxIterations; iter++) {
      // Update current iteration
      await prisma.triggerOptimizationRun.update({
        where: { id: runId },
        data: { currentIteration: iter + 1 },
      })

      // Evaluate on train split
      const trainResults = await evaluateQueries(
        queries, trainIndices, currentDescription, skillContent
      )
      const trainScore = computeAccuracy(trainResults)

      // Evaluate on test split
      const testResults = await evaluateQueries(
        queries, testIndices, currentDescription, skillContent
      )
      const testScore = computeAccuracy(testResults)

      // Record this iteration
      const failedTrain = trainResults.filter(r => !r.passed)
      await prisma.triggerOptimizationIteration.create({
        data: {
          runId,
          iteration: iter + 1,
          description: currentDescription,
          trainScore,
          testScore,
          trainResultsJson: JSON.stringify(trainResults),
          testResultsJson: JSON.stringify(testResults),
          improvementReason: iter === 0
            ? 'Initial evaluation of original description'
            : previousAttempts[previousAttempts.length - 1]?.failedQueries
                .map(q => `${q.shouldTrigger ? 'FN' : 'FP'}: "${q.query}"`)
                .join('; ') || '',
        },
      })

      // Track for history
      previousAttempts.push({
        iteration: iter + 1,
        description: currentDescription,
        trainScore,
        testScore,
        failedQueries: failedTrain.map(r => ({
          query: r.query,
          shouldTrigger: r.shouldTrigger,
          triggerRate: r.triggerRate,
        })),
      })

      // Update best by TEST score (prevents overfitting)
      if (testScore > bestTestScore || (testScore === bestTestScore && trainScore > bestTrainScore)) {
        bestTestScore = testScore
        bestTrainScore = trainScore
        bestDescription = currentDescription
      }

      // Update run progress
      await prisma.triggerOptimizationRun.update({
        where: { id: runId },
        data: { bestTestScore, bestTrainScore, bestDescription },
      })

      // If perfect score on both, stop early
      if (trainScore === 1 && testScore === 1) break

      // If no failures on train, skip improvement (nothing to learn from)
      if (failedTrain.length === 0 && testScore >= 0.9) break

      // Generate improved description for next iteration (if not last)
      if (iter < run.maxIterations - 1) {
        const improvement = await improveDescription(
          currentDescription, skillContent, failedTrain, previousAttempts
        )
        currentDescription = improvement.description
      }
    }

    // Mark complete
    await prisma.triggerOptimizationRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        bestTestScore,
        bestTrainScore,
        bestDescription,
      },
    })
  } catch (err) {
    await prisma.triggerOptimizationRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      },
    })
    throw err
  }

  return getProgress(runId)
}

/**
 * Get current optimization progress.
 */
export async function getProgress(runId: string): Promise<OptimizationProgress> {
  const run = await prisma.triggerOptimizationRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      iterations: {
        orderBy: { iteration: 'asc' },
      },
    },
  })

  return {
    runId: run.id,
    status: run.status,
    currentIteration: run.currentIteration,
    maxIterations: run.maxIterations,
    bestTestScore: run.bestTestScore,
    bestTrainScore: run.bestTrainScore,
    bestDescription: run.bestDescription,
    originalDescription: run.originalDescription,
    iterations: run.iterations.map(it => ({
      iteration: it.iteration,
      description: it.description,
      trainScore: it.trainScore,
      testScore: it.testScore,
      improvementReason: it.improvementReason,
    })),
  }
}

/**
 * Promote the best description by updating the skill's SKILL.md.
 */
export async function promoteBestDescription(
  runId: string,
): Promise<{ description: string }> {
  const run = await prisma.triggerOptimizationRun.findUniqueOrThrow({
    where: { id: runId },
  })

  if (run.status !== 'completed') {
    throw new Error('Cannot promote: optimization is not completed')
  }

  return { description: run.bestDescription }
}
