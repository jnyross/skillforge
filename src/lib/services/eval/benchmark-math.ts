/**
 * Benchmark math for eval suite runs.
 * Computes aggregate statistics, deltas vs baseline, and failure clustering.
 *
 * From PRD 8.5:
 * - pass rate mean/stddev
 * - duration mean/stddev
 * - token mean/stddev
 * - delta vs baseline
 * - wins/losses/ties vs baseline
 * - failure clusters by tag
 */

export interface CaseResult {
  caseId: string
  passed: boolean
  durationMs: number
  tokenCount: number
  costUsd: number
  tags: string[]
  assertionResults?: Array<{ type: string; passed: boolean }>
}

export interface BenchmarkSummary {
  totalCases: number
  passCount: number
  failCount: number
  passRate: number

  duration: { mean: number; stddev: number; min: number; max: number; median: number }
  tokens: { mean: number; stddev: number; min: number; max: number; median: number }
  cost: { total: number; mean: number }

  // Per-tag breakdown
  tagBreakdown: Record<string, { total: number; passed: number; passRate: number }>

  // Failure clusters
  failureClusters: Array<{
    tags: string[]
    count: number
    percentage: number
    commonAssertionFailures: string[]
  }>
}

export interface BaselineComparison {
  candidatePassRate: number
  baselinePassRate: number
  passRateDelta: number

  candidateDurationMean: number
  baselineDurationMean: number
  durationDelta: number
  durationDeltaPercent: number

  candidateTokenMean: number
  baselineTokenMean: number
  tokenDelta: number
  tokenDeltaPercent: number

  candidateCostTotal: number
  baselineCostTotal: number
  costDelta: number

  wins: number
  losses: number
  ties: number
  winRate: number

  perCaseComparison: Array<{
    caseId: string
    candidatePassed: boolean
    baselinePassed: boolean
    verdict: 'win' | 'loss' | 'tie'
    durationDelta: number
    tokenDelta: number
  }>
}

/**
 * Compute summary statistics for a set of case results.
 */
export function computeBenchmarkSummary(results: CaseResult[]): BenchmarkSummary {
  if (results.length === 0) {
    return {
      totalCases: 0,
      passCount: 0,
      failCount: 0,
      passRate: 0,
      duration: { mean: 0, stddev: 0, min: 0, max: 0, median: 0 },
      tokens: { mean: 0, stddev: 0, min: 0, max: 0, median: 0 },
      cost: { total: 0, mean: 0 },
      tagBreakdown: {},
      failureClusters: [],
    }
  }

  const passCount = results.filter(r => r.passed).length
  const failCount = results.length - passCount

  const durations = results.map(r => r.durationMs)
  const tokens = results.map(r => r.tokenCount)
  const costs = results.map(r => r.costUsd)

  // Tag breakdown
  const tagBreakdown: Record<string, { total: number; passed: number; passRate: number }> = {}
  for (const result of results) {
    for (const tag of result.tags) {
      if (!tagBreakdown[tag]) {
        tagBreakdown[tag] = { total: 0, passed: 0, passRate: 0 }
      }
      tagBreakdown[tag].total++
      if (result.passed) tagBreakdown[tag].passed++
    }
  }
  for (const tag of Object.keys(tagBreakdown)) {
    tagBreakdown[tag].passRate = tagBreakdown[tag].total > 0
      ? tagBreakdown[tag].passed / tagBreakdown[tag].total
      : 0
  }

  // Failure clustering by tag combination
  const failedResults = results.filter(r => !r.passed)
  const failureClusters = computeFailureClusters(failedResults, results.length)

  return {
    totalCases: results.length,
    passCount,
    failCount,
    passRate: results.length > 0 ? passCount / results.length : 0,
    duration: computeStats(durations),
    tokens: computeStats(tokens),
    cost: { total: sum(costs), mean: mean(costs) },
    tagBreakdown,
    failureClusters,
  }
}

/**
 * Compare candidate results against baseline results.
 */
export function computeBaselineComparison(
  candidateResults: CaseResult[],
  baselineResults: CaseResult[]
): BaselineComparison {
  const candidateSummary = computeBenchmarkSummary(candidateResults)
  const baselineSummary = computeBenchmarkSummary(baselineResults)

  // Build per-case comparison
  const baselineMap = new Map(baselineResults.map(r => [r.caseId, r]))
  const perCaseComparison: BaselineComparison['perCaseComparison'] = []
  let wins = 0
  let losses = 0
  let ties = 0

  for (const candidate of candidateResults) {
    const baseline = baselineMap.get(candidate.caseId)

    if (!baseline) {
      // No baseline for this case — count as win if passed
      const verdict = candidate.passed ? 'win' as const : 'tie' as const
      if (verdict === 'win') wins++
      else ties++
      perCaseComparison.push({
        caseId: candidate.caseId,
        candidatePassed: candidate.passed,
        baselinePassed: false,
        verdict,
        durationDelta: 0,
        tokenDelta: 0,
      })
      continue
    }

    let verdict: 'win' | 'loss' | 'tie'
    if (candidate.passed && !baseline.passed) {
      verdict = 'win'
      wins++
    } else if (!candidate.passed && baseline.passed) {
      verdict = 'loss'
      losses++
    } else {
      verdict = 'tie'
      ties++
    }

    perCaseComparison.push({
      caseId: candidate.caseId,
      candidatePassed: candidate.passed,
      baselinePassed: baseline.passed,
      verdict,
      durationDelta: candidate.durationMs - baseline.durationMs,
      tokenDelta: candidate.tokenCount - baseline.tokenCount,
    })
  }

  const total = wins + losses + ties

  return {
    candidatePassRate: candidateSummary.passRate,
    baselinePassRate: baselineSummary.passRate,
    passRateDelta: candidateSummary.passRate - baselineSummary.passRate,

    candidateDurationMean: candidateSummary.duration.mean,
    baselineDurationMean: baselineSummary.duration.mean,
    durationDelta: candidateSummary.duration.mean - baselineSummary.duration.mean,
    durationDeltaPercent: baselineSummary.duration.mean > 0
      ? (candidateSummary.duration.mean - baselineSummary.duration.mean) / baselineSummary.duration.mean
      : 0,

    candidateTokenMean: candidateSummary.tokens.mean,
    baselineTokenMean: baselineSummary.tokens.mean,
    tokenDelta: candidateSummary.tokens.mean - baselineSummary.tokens.mean,
    tokenDeltaPercent: baselineSummary.tokens.mean > 0
      ? (candidateSummary.tokens.mean - baselineSummary.tokens.mean) / baselineSummary.tokens.mean
      : 0,

    candidateCostTotal: candidateSummary.cost.total,
    baselineCostTotal: baselineSummary.cost.total,
    costDelta: candidateSummary.cost.total - baselineSummary.cost.total,

    wins,
    losses,
    ties,
    winRate: total > 0 ? wins / total : 0,

    perCaseComparison,
  }
}

// --- Utility functions ---

function computeFailureClusters(
  failedResults: CaseResult[],
  totalCount: number
): BenchmarkSummary['failureClusters'] {
  if (failedResults.length === 0) return []

  // Group by tag signature
  const tagGroups = new Map<string, CaseResult[]>()
  for (const result of failedResults) {
    const tagKey = result.tags.sort().join(',') || '(untagged)'
    const group = tagGroups.get(tagKey) ?? []
    group.push(result)
    tagGroups.set(tagKey, group)
  }

  const clusters: BenchmarkSummary['failureClusters'] = []
  for (const [tagKey, group] of Array.from(tagGroups.entries())) {
    // Find common assertion failures
    const assertionFailureCounts = new Map<string, number>()
    for (const result of group) {
      if (result.assertionResults) {
        for (const ar of result.assertionResults) {
          if (!ar.passed) {
            const count = assertionFailureCounts.get(ar.type) ?? 0
            assertionFailureCounts.set(ar.type, count + 1)
          }
        }
      }
    }

    const commonAssertionFailures = Array.from(assertionFailureCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type]) => type)

    clusters.push({
      tags: tagKey === '(untagged)' ? [] : tagKey.split(','),
      count: group.length,
      percentage: totalCount > 0 ? group.length / totalCount : 0,
      commonAssertionFailures,
    })
  }

  return clusters.sort((a, b) => b.count - a.count)
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return sum(values) / values.length
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0
  const m = mean(values)
  const squaredDiffs = values.map(v => (v - m) ** 2)
  return Math.sqrt(sum(squaredDiffs) / (values.length - 1))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export function computeStats(values: number[]): {
  mean: number
  stddev: number
  min: number
  max: number
  median: number
} {
  if (values.length === 0) {
    return { mean: 0, stddev: 0, min: 0, max: 0, median: 0 }
  }
  return {
    mean: mean(values),
    stddev: stddev(values),
    min: Math.min(...values),
    max: Math.max(...values),
    median: median(values),
  }
}
