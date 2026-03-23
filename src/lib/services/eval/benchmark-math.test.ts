import { describe, it, expect } from 'vitest'
import {
  computeBenchmarkSummary,
  computeBaselineComparison,
  computeStats,
  type CaseResult,
} from './benchmark-math'

describe('computeStats', () => {
  it('should return zeros for empty array', () => {
    const stats = computeStats([])
    expect(stats.mean).toBe(0)
    expect(stats.stddev).toBe(0)
    expect(stats.min).toBe(0)
    expect(stats.max).toBe(0)
    expect(stats.median).toBe(0)
  })

  it('should compute stats for single value', () => {
    const stats = computeStats([42])
    expect(stats.mean).toBe(42)
    expect(stats.stddev).toBe(0)
    expect(stats.min).toBe(42)
    expect(stats.max).toBe(42)
    expect(stats.median).toBe(42)
  })

  it('should compute stats for multiple values', () => {
    const stats = computeStats([10, 20, 30, 40, 50])
    expect(stats.mean).toBe(30)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(50)
    expect(stats.median).toBe(30)
    expect(stats.stddev).toBeCloseTo(15.811, 2)
  })

  it('should compute median for even number of values', () => {
    const stats = computeStats([10, 20, 30, 40])
    expect(stats.median).toBe(25)
  })
})

describe('computeBenchmarkSummary', () => {
  it('should return zeros for empty results', () => {
    const summary = computeBenchmarkSummary([])
    expect(summary.totalCases).toBe(0)
    expect(summary.passRate).toBe(0)
  })

  it('should compute basic metrics', () => {
    const results: CaseResult[] = [
      { caseId: '1', passed: true, durationMs: 100, tokenCount: 500, costUsd: 0.01, tags: ['basic'] },
      { caseId: '2', passed: true, durationMs: 200, tokenCount: 600, costUsd: 0.02, tags: ['basic'] },
      { caseId: '3', passed: false, durationMs: 150, tokenCount: 550, costUsd: 0.015, tags: ['edge'] },
    ]

    const summary = computeBenchmarkSummary(results)
    expect(summary.totalCases).toBe(3)
    expect(summary.passCount).toBe(2)
    expect(summary.failCount).toBe(1)
    expect(summary.passRate).toBeCloseTo(0.667, 2)
    expect(summary.duration.mean).toBe(150)
    expect(summary.tokens.mean).toBeCloseTo(550)
    expect(summary.cost.total).toBeCloseTo(0.045)
  })

  it('should compute tag breakdown', () => {
    const results: CaseResult[] = [
      { caseId: '1', passed: true, durationMs: 100, tokenCount: 500, costUsd: 0.01, tags: ['basic'] },
      { caseId: '2', passed: false, durationMs: 200, tokenCount: 600, costUsd: 0.02, tags: ['basic'] },
      { caseId: '3', passed: true, durationMs: 150, tokenCount: 550, costUsd: 0.015, tags: ['edge'] },
    ]

    const summary = computeBenchmarkSummary(results)
    expect(summary.tagBreakdown['basic'].total).toBe(2)
    expect(summary.tagBreakdown['basic'].passed).toBe(1)
    expect(summary.tagBreakdown['basic'].passRate).toBe(0.5)
    expect(summary.tagBreakdown['edge'].total).toBe(1)
    expect(summary.tagBreakdown['edge'].passRate).toBe(1)
  })

  it('should cluster failures by tag', () => {
    const results: CaseResult[] = [
      { caseId: '1', passed: false, durationMs: 100, tokenCount: 500, costUsd: 0.01, tags: ['parser'], assertionResults: [{ type: 'contains', passed: false }] },
      { caseId: '2', passed: false, durationMs: 200, tokenCount: 600, costUsd: 0.02, tags: ['parser'], assertionResults: [{ type: 'contains', passed: false }] },
      { caseId: '3', passed: false, durationMs: 150, tokenCount: 550, costUsd: 0.015, tags: ['io'], assertionResults: [{ type: 'file_exists', passed: false }] },
      { caseId: '4', passed: true, durationMs: 120, tokenCount: 480, costUsd: 0.012, tags: ['basic'] },
    ]

    const summary = computeBenchmarkSummary(results)
    expect(summary.failureClusters.length).toBe(2)
    expect(summary.failureClusters[0].tags).toEqual(['parser'])
    expect(summary.failureClusters[0].count).toBe(2)
    expect(summary.failureClusters[0].commonAssertionFailures).toContain('contains')
    expect(summary.failureClusters[1].tags).toEqual(['io'])
    expect(summary.failureClusters[1].count).toBe(1)
  })
})

describe('computeBaselineComparison', () => {
  it('should compute wins/losses/ties', () => {
    const candidate: CaseResult[] = [
      { caseId: '1', passed: true, durationMs: 100, tokenCount: 500, costUsd: 0.01, tags: [] },
      { caseId: '2', passed: true, durationMs: 200, tokenCount: 600, costUsd: 0.02, tags: [] },
      { caseId: '3', passed: false, durationMs: 150, tokenCount: 550, costUsd: 0.015, tags: [] },
    ]
    const baseline: CaseResult[] = [
      { caseId: '1', passed: true, durationMs: 120, tokenCount: 520, costUsd: 0.012, tags: [] },
      { caseId: '2', passed: false, durationMs: 250, tokenCount: 700, costUsd: 0.025, tags: [] },
      { caseId: '3', passed: true, durationMs: 140, tokenCount: 530, costUsd: 0.014, tags: [] },
    ]

    const comparison = computeBaselineComparison(candidate, baseline)
    expect(comparison.wins).toBe(1) // case 2: candidate passed, baseline failed
    expect(comparison.losses).toBe(1) // case 3: candidate failed, baseline passed
    expect(comparison.ties).toBe(1) // case 1: both passed
    expect(comparison.winRate).toBeCloseTo(1 / 3, 2)
  })

  it('should compute pass rate delta', () => {
    const candidate: CaseResult[] = [
      { caseId: '1', passed: true, durationMs: 100, tokenCount: 500, costUsd: 0.01, tags: [] },
      { caseId: '2', passed: true, durationMs: 200, tokenCount: 600, costUsd: 0.02, tags: [] },
    ]
    const baseline: CaseResult[] = [
      { caseId: '1', passed: true, durationMs: 120, tokenCount: 520, costUsd: 0.012, tags: [] },
      { caseId: '2', passed: false, durationMs: 250, tokenCount: 700, costUsd: 0.025, tags: [] },
    ]

    const comparison = computeBaselineComparison(candidate, baseline)
    expect(comparison.candidatePassRate).toBe(1)
    expect(comparison.baselinePassRate).toBe(0.5)
    expect(comparison.passRateDelta).toBeCloseTo(0.5)
  })

  it('should compute duration deltas', () => {
    const candidate: CaseResult[] = [
      { caseId: '1', passed: true, durationMs: 100, tokenCount: 500, costUsd: 0.01, tags: [] },
    ]
    const baseline: CaseResult[] = [
      { caseId: '1', passed: true, durationMs: 200, tokenCount: 500, costUsd: 0.01, tags: [] },
    ]

    const comparison = computeBaselineComparison(candidate, baseline)
    expect(comparison.durationDelta).toBe(-100) // candidate is faster
    expect(comparison.durationDeltaPercent).toBe(-0.5) // 50% faster
  })

  it('should handle empty results', () => {
    const comparison = computeBaselineComparison([], [])
    expect(comparison.wins).toBe(0)
    expect(comparison.losses).toBe(0)
    expect(comparison.ties).toBe(0)
    expect(comparison.winRate).toBe(0)
  })
})
