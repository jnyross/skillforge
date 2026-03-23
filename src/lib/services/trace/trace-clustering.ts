/**
 * Trace Clustering Service
 * Groups similar failures by tag, error message, and derived views.
 * Implements PRD section 8.8 derived views.
 */

import { prisma } from '@/lib/prisma'

export interface FailureCluster {
  label: string
  count: number
  traceIds: string[]
  avgDurationMs: number | null
  avgTokens: number | null
}

export interface DerivedViewResult {
  view: string
  traces: Array<{
    id: string
    status: string
    model: string
    totalDurationMs: number | null
    totalTokens: number | null
    totalCostUsd: number | null
    error: string | null
    createdAt: Date
    evalRun: { id: string; suite: { id: string; name: string; type: string } } | null
    skillVersion: { id: string; commitMessage: string; skillRepo: { displayName: string } } | null
  }>
  total: number
}

const traceInclude = {
  evalRun: {
    select: {
      id: true,
      suite: { select: { id: true, name: true, type: true } },
    },
  },
  skillVersion: {
    select: {
      id: true,
      commitMessage: true,
      skillRepo: { select: { displayName: true } },
    },
  },
}

/**
 * Group failed traces by error message similarity.
 */
export async function getFailureClusters(
  filters: { skillRepoId?: string; suiteId?: string; evalRunId?: string }
): Promise<FailureCluster[]> {
  const where: Record<string, unknown> = { status: 'failed' }
  if (filters.evalRunId) where.evalRunId = filters.evalRunId
  if (filters.skillRepoId) {
    where.skillVersion = { skillRepoId: filters.skillRepoId }
  }
  if (filters.suiteId) {
    where.evalRun = { suiteId: filters.suiteId }
  }

  const failedTraces = await prisma.trace.findMany({
    where,
    select: {
      id: true,
      error: true,
      totalDurationMs: true,
      totalTokens: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  // Cluster by normalized error message
  const clusters = new Map<string, { traceIds: string[]; durations: number[]; tokens: number[] }>()

  for (const trace of failedTraces) {
    const key = normalizeError(trace.error || 'Unknown error')
    if (!clusters.has(key)) {
      clusters.set(key, { traceIds: [], durations: [], tokens: [] })
    }
    const cluster = clusters.get(key)!
    cluster.traceIds.push(trace.id)
    if (trace.totalDurationMs != null) cluster.durations.push(trace.totalDurationMs)
    if (trace.totalTokens != null) cluster.tokens.push(trace.totalTokens)
  }

  return Array.from(clusters.entries())
    .map(([label, data]) => ({
      label,
      count: data.traceIds.length,
      traceIds: data.traceIds,
      avgDurationMs: data.durations.length > 0
        ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
        : null,
      avgTokens: data.tokens.length > 0
        ? data.tokens.reduce((a, b) => a + b, 0) / data.tokens.length
        : null,
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Get traces matching a derived view.
 */
export async function getDerivedView(
  view: string,
  limit: number = 50,
  offset: number = 0
): Promise<DerivedViewResult> {
  switch (view) {
    case 'high-token-outliers':
      return getHighTokenOutliers(limit, offset)
    case 'high-latency-outliers':
      return getHighLatencyOutliers(limit, offset)
    case 'flaky-cases':
      return getFlakyCases(limit, offset)
    case 'judge-disagrees':
      return getJudgeDisagrees(limit, offset)
    case 'passes-but-loses-review':
      return getPassesButLosesReview(limit, offset)
    default:
      return { view, traces: [], total: 0 }
  }
}

/**
 * Get traces with token counts > 2σ above mean.
 */
async function getHighTokenOutliers(limit: number, offset: number): Promise<DerivedViewResult> {
  const stats = await prisma.trace.aggregate({
    _avg: { totalTokens: true },
    _count: true,
    where: { totalTokens: { not: null } },
  })

  if (!stats._avg.totalTokens || stats._count < 5) {
    return { view: 'high-token-outliers', traces: [], total: 0 }
  }

  // Compute stddev manually
  const allTokens = await prisma.trace.findMany({
    where: { totalTokens: { not: null } },
    select: { totalTokens: true },
  })
  const mean = stats._avg.totalTokens
  const variance = allTokens.reduce((sum, t) => sum + Math.pow((t.totalTokens || 0) - mean, 2), 0) / allTokens.length
  const stddev = Math.sqrt(variance)
  const threshold = Math.round(mean + 2 * stddev)

  const [traces, total] = await Promise.all([
    prisma.trace.findMany({
      where: { totalTokens: { gte: threshold } },
      include: traceInclude,
      orderBy: { totalTokens: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.trace.count({ where: { totalTokens: { gte: threshold } } }),
  ])

  return { view: 'high-token-outliers', traces, total }
}

/**
 * Get traces with duration > 2σ above mean.
 */
async function getHighLatencyOutliers(limit: number, offset: number): Promise<DerivedViewResult> {
  const stats = await prisma.trace.aggregate({
    _avg: { totalDurationMs: true },
    _count: true,
    where: { totalDurationMs: { not: null } },
  })

  if (!stats._avg.totalDurationMs || stats._count < 5) {
    return { view: 'high-latency-outliers', traces: [], total: 0 }
  }

  const allDurations = await prisma.trace.findMany({
    where: { totalDurationMs: { not: null } },
    select: { totalDurationMs: true },
  })
  const mean = stats._avg.totalDurationMs
  const variance = allDurations.reduce((sum, t) => sum + Math.pow((t.totalDurationMs || 0) - mean, 2), 0) / allDurations.length
  const stddev = Math.sqrt(variance)
  const threshold = Math.round(mean + 2 * stddev)

  const [traces, total] = await Promise.all([
    prisma.trace.findMany({
      where: { totalDurationMs: { gte: threshold } },
      include: traceInclude,
      orderBy: { totalDurationMs: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.trace.count({ where: { totalDurationMs: { gte: threshold } } }),
  ])

  return { view: 'high-latency-outliers', traces, total }
}

/**
 * Get eval cases with inconsistent outcomes across recent runs.
 */
async function getFlakyCases(limit: number, offset: number): Promise<DerivedViewResult> {
  // Find cases that have both passed and failed across recent runs
  const caseRuns = await prisma.evalCaseRun.findMany({
    select: {
      evalCaseId: true,
      status: true,
      traceId: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  // Group by case ID and check for inconsistency
  const caseResults = new Map<string, { statuses: Set<string>; traceIds: string[] }>()
  for (const cr of caseRuns) {
    if (!caseResults.has(cr.evalCaseId)) {
      caseResults.set(cr.evalCaseId, { statuses: new Set(), traceIds: [] })
    }
    const entry = caseResults.get(cr.evalCaseId)!
    entry.statuses.add(cr.status)
    if (cr.traceId) entry.traceIds.push(cr.traceId)
  }

  const flakyTraceIds = Array.from(caseResults.values())
    .filter(e => e.statuses.has('passed') && e.statuses.has('failed'))
    .flatMap(e => e.traceIds)
    .slice(0, 200)

  if (flakyTraceIds.length === 0) {
    return { view: 'flaky-cases', traces: [], total: 0 }
  }

  const [traces, total] = await Promise.all([
    prisma.trace.findMany({
      where: { id: { in: flakyTraceIds.slice(offset, offset + limit) } },
      include: traceInclude,
      orderBy: { createdAt: 'desc' },
    }),
    Promise.resolve(flakyTraceIds.length),
  ])

  return { view: 'flaky-cases', traces, total }
}

/**
 * Get traces where judge verdict disagrees with human review label.
 */
async function getJudgeDisagrees(_limit: number, _offset: number): Promise<DerivedViewResult> {
  // Find case runs that have both judge assertions and human review labels
  const caseRunsWithJudge = await prisma.evalCaseRun.findMany({
    where: {
      assertions: { some: { type: 'judge' } },
    },
    select: {
      id: true,
      traceId: true,
      assertions: {
        where: { type: 'judge' },
        select: { passed: true },
      },
    },
    take: 500,
  })

  const caseRunIds = caseRunsWithJudge.map(cr => cr.id)
  if (caseRunIds.length === 0) {
    return { view: 'judge-disagrees', traces: [], total: 0 }
  }

  // Find review labels for these case runs
  const labels = await prisma.reviewLabel.findMany({
    where: { evalCaseRunId: { in: caseRunIds } },
    select: { evalCaseRunId: true, label: true },
  })
  const labelMap = new Map(labels.map(l => [l.evalCaseRunId, l.label]))

  // Find disagreements
  const disagreeTraceIds: string[] = []
  for (const cr of caseRunsWithJudge) {
    const humanLabel = labelMap.get(cr.id)
    if (!humanLabel || !cr.traceId) continue
    const judgePassed = cr.assertions.some(a => a.passed)
    const humanPassed = humanLabel === 'pass'
    if (judgePassed !== humanPassed) {
      disagreeTraceIds.push(cr.traceId)
    }
  }

  if (disagreeTraceIds.length === 0) {
    return { view: 'judge-disagrees', traces: [], total: 0 }
  }

  const traces = await prisma.trace.findMany({
    where: { id: { in: disagreeTraceIds.slice(_offset, _offset + _limit) } },
    include: traceInclude,
    orderBy: { createdAt: 'desc' },
  })

  return { view: 'judge-disagrees', traces, total: disagreeTraceIds.length }
}

/**
 * Get traces that pass assertions but lose blind review.
 */
async function getPassesButLosesReview(_limit: number, _offset: number): Promise<DerivedViewResult> {
  // Find case runs that passed all assertions
  const passedRuns = await prisma.evalCaseRun.findMany({
    where: { status: 'passed' },
    select: { id: true, traceId: true },
    take: 500,
  })

  const passedIds = passedRuns.map(r => r.id)
  if (passedIds.length === 0) {
    return { view: 'passes-but-loses-review', traces: [], total: 0 }
  }

  // Find review labels that are 'fail' for these passed runs
  const failLabels = await prisma.reviewLabel.findMany({
    where: {
      evalCaseRunId: { in: passedIds },
      label: 'fail',
    },
    select: { evalCaseRunId: true },
  })

  const failedCaseRunIds = new Set(failLabels.map(l => l.evalCaseRunId))
  const traceIds = passedRuns
    .filter(r => failedCaseRunIds.has(r.id) && r.traceId)
    .map(r => r.traceId!)

  if (traceIds.length === 0) {
    return { view: 'passes-but-loses-review', traces: [], total: 0 }
  }

  const traces = await prisma.trace.findMany({
    where: { id: { in: traceIds.slice(_offset, _offset + _limit) } },
    include: traceInclude,
    orderBy: { createdAt: 'desc' },
  })

  return { view: 'passes-but-loses-review', traces, total: traceIds.length }
}

/**
 * Normalize error messages for clustering.
 */
function normalizeError(error: string): string {
  return error
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<UUID>')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '<TIMESTAMP>')
    .replace(/\b\d+ms\b/g, '<DURATION>')
    .replace(/line \d+/g, 'line <N>')
    .replace(/at .+:\d+:\d+/g, 'at <LOCATION>')
    .trim()
    .slice(0, 200)
}
