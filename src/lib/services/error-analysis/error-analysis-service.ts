/**
 * Error Analysis Service
 * Implements Hamel Hussain's error analysis workflow:
 * 1. Open coding: Domain expert reviews traces and writes free-text notes
 * 2. Axial coding: Categorize notes into 3-7 failure categories
 * 3. Saturation tracking: Stop when new categories per trace reviewed approaches zero
 * 4. Generate eval cases from discovered failure categories
 */

import { prisma } from '@/lib/prisma'

export interface SaturationMetrics {
  tracesReviewed: number
  totalTraces: number
  categoriesDiscovered: number
  newCategoriesInLast10: number
  saturationReached: boolean
  reviewProgress: number // 0-1
}

/**
 * Sample traces for a new error analysis session based on strategy.
 */
export async function sampleTraces(
  skillRepoId: string,
  strategy: string,
  count: number
): Promise<string[]> {
  switch (strategy) {
    case 'failure-driven': {
      const traces = await prisma.trace.findMany({
        where: { status: 'failed', skillVersion: { skillRepoId } },
        orderBy: { createdAt: 'desc' },
        take: count,
        select: { id: true },
      })
      return traces.map(t => t.id)
    }
    case 'outlier': {
      // Get traces with unusual duration or token counts
      const allTraces = await prisma.trace.findMany({
        where: { skillVersion: { skillRepoId } },
        orderBy: { totalDurationMs: 'desc' },
        take: count,
        select: { id: true },
      })
      return allTraces.map(t => t.id)
    }
    case 'stratified': {
      // Mix of passed and failed
      const failed = await prisma.trace.findMany({
        where: { status: 'failed', skillVersion: { skillRepoId } },
        take: Math.ceil(count / 2),
        select: { id: true },
      })
      const completed = await prisma.trace.findMany({
        where: { status: 'completed', skillVersion: { skillRepoId } },
        take: Math.floor(count / 2),
        select: { id: true },
      })
      return [...failed, ...completed].map(t => t.id)
    }
    case 'random':
    default: {
      const traces = await prisma.trace.findMany({
        where: { skillVersion: { skillRepoId } },
        take: count * 3, // Oversample to allow random selection
        select: { id: true },
      })
      // Shuffle and take count
      const shuffled = traces.sort(() => Math.random() - 0.5)
      return shuffled.slice(0, count).map(t => t.id)
    }
  }
}

/**
 * Compute saturation metrics for an error analysis session.
 * Saturation is approached when the rate of discovering new categories decreases.
 */
export async function computeSaturation(sessionId: string): Promise<SaturationMetrics> {
  const allTraces = await prisma.errorAnalysisTrace.findMany({
    where: { analysisSessionId: sessionId },
    orderBy: { sequence: 'asc' },
  })

  const reviewedTraces = allTraces.filter(t => t.reviewedAt !== null)

  const categories = await prisma.failureCategory.findMany({
    where: { analysisSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
  })

  const tracesReviewed = reviewedTraces.length
  const totalTraces = allTraces.length
  const categoriesDiscovered = categories.length

  // Count new categories discovered in last 10 reviewed traces
  const last10 = reviewedTraces.slice(-10)
  const newCategoriesInLast10 = last10.filter(t => t.isNewFailureMode).length

  // Saturation: no new categories in last 10 reviewed traces and we've reviewed enough
  const saturationReached = tracesReviewed >= 10 && newCategoriesInLast10 === 0 && categoriesDiscovered > 0

  const reviewProgress = totalTraces > 0 ? tracesReviewed / totalTraces : 0

  return {
    tracesReviewed,
    totalTraces,
    categoriesDiscovered,
    newCategoriesInLast10,
    saturationReached,
    reviewProgress,
  }
}

/**
 * Generate eval cases from discovered failure categories.
 */
export async function generateEvalCasesFromCategories(
  sessionId: string,
  targetSuiteId: string
): Promise<{ created: number; errors: string[] }> {
  const categories = await prisma.failureCategory.findMany({
    where: { analysisSessionId: sessionId },
    include: {
      traces: {
        include: { trace: true },
        take: 2,
      },
    },
  })

  let created = 0
  const errors: string[] = []

  for (const category of categories) {
    // Get example traces for this category
    const exampleTrace = category.traces[0]?.trace

    try {
      // Check for duplicate key
      const existingKey = `error-analysis-${category.id}`
      const existing = await prisma.evalCase.findFirst({
        where: { evalSuiteId: targetSuiteId, key: existingKey },
      })
      if (existing) continue

      await prisma.evalCase.create({
        data: {
          evalSuiteId: targetSuiteId,
          key: existingKey,
          name: `[Error Analysis] ${category.name}`,
          prompt: exampleTrace
            ? `Reproduce failure category: ${category.name}\n\nDescription: ${category.description}\n\nOriginal trace output: ${(JSON.parse(exampleTrace.resultJson || '{}') as { result?: string }).result?.slice(0, 500) || 'N/A'}`
            : `Test for failure category: ${category.name}\n\nDescription: ${category.description}`,
          expectedOutcome: `Should NOT exhibit: ${category.name}`,
          split: 'validation',
          source: 'error-analysis',
          tags: `error-analysis,${category.severity}`,
        },
      })
      created++
    } catch (err) {
      errors.push(`Failed to create eval case for "${category.name}": ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { created, errors }
}
