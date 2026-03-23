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
  totalTracesReviewed: number
  totalCategories: number
  tracesPerNewCategory: number[]  // rolling window of traces between new categories
  isApproachingSaturation: boolean
  saturationConfidence: number // 0-1
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
  const traces = await prisma.errorAnalysisTrace.findMany({
    where: { analysisSessionId: sessionId, reviewedAt: { not: null } },
    orderBy: { sequence: 'asc' },
  })

  const categories = await prisma.failureCategory.findMany({
    where: { analysisSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
  })

  const totalTracesReviewed = traces.length
  const totalCategories = categories.length

  // Calculate traces between new category discoveries
  const tracesPerNewCategory: number[] = []
  let lastNewCategoryTrace = 0

  for (const trace of traces) {
    if (trace.isNewFailureMode) {
      tracesPerNewCategory.push(trace.sequence - lastNewCategoryTrace)
      lastNewCategoryTrace = trace.sequence
    }
  }

  // Saturation confidence: based on the trend of traces between new categories
  // If the gap between new categories is growing, we're approaching saturation
  let saturationConfidence = 0
  if (tracesPerNewCategory.length >= 3) {
    const recent = tracesPerNewCategory.slice(-3)
    const early = tracesPerNewCategory.slice(0, 3)
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
    const earlyAvg = early.reduce((a, b) => a + b, 0) / early.length
    if (earlyAvg > 0) {
      saturationConfidence = Math.min(1, recentAvg / (earlyAvg * 3))
    }
  }

  // Also consider: if we've reviewed 5+ traces without a new category, confidence increases
  if (totalTracesReviewed > 0 && totalCategories > 0) {
    const tracesSinceLastCategory = totalTracesReviewed - lastNewCategoryTrace
    if (tracesSinceLastCategory >= 10) saturationConfidence = Math.max(saturationConfidence, 0.9)
    else if (tracesSinceLastCategory >= 5) saturationConfidence = Math.max(saturationConfidence, 0.6)
  }

  return {
    totalTracesReviewed,
    totalCategories,
    tracesPerNewCategory,
    isApproachingSaturation: saturationConfidence >= 0.7,
    saturationConfidence,
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
