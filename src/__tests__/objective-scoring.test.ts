/**
 * Unit tests for objective scoring service.
 */
import { describe, it, expect } from 'vitest'
import {
  computeObjectiveScore,
  shouldKeepCandidate,
  DEFAULT_WEIGHTS,
  type EvalMetrics,
  type ObjectiveScore,
} from '../lib/services/optimizer/objective-scoring'

function makeMetrics(overrides?: Partial<EvalMetrics>): EvalMetrics {
  return {
    passRate: 0.8,
    totalCases: 10,
    passCount: 8,
    failCount: 2,
    avgDurationMs: 1000,
    totalTokens: 5000,
    totalCostUsd: 0.05,
    ...overrides,
  }
}

describe('Objective Scoring', () => {
  describe('DEFAULT_WEIGHTS', () => {
    it('should have weights that sum to approximately 1', () => {
      const sum = DEFAULT_WEIGHTS.assertionPassRate
        + DEFAULT_WEIGHTS.triggerPerformance
        + DEFAULT_WEIGHTS.regressionPassRate
        + DEFAULT_WEIGHTS.judgeAgreement
        + DEFAULT_WEIGHTS.durationPenalty
        + DEFAULT_WEIGHTS.tokenPenalty
        + DEFAULT_WEIGHTS.flakinessPenalty
        + DEFAULT_WEIGHTS.linterPenalty
      expect(sum).toBeCloseTo(1.0, 1)
    })

    it('should prioritize assertion pass rate', () => {
      expect(DEFAULT_WEIGHTS.assertionPassRate).toBeGreaterThan(DEFAULT_WEIGHTS.durationPenalty)
      expect(DEFAULT_WEIGHTS.assertionPassRate).toBeGreaterThan(DEFAULT_WEIGHTS.tokenPenalty)
      expect(DEFAULT_WEIGHTS.assertionPassRate).toBeGreaterThan(DEFAULT_WEIGHTS.flakinessPenalty)
    })
  })

  describe('computeObjectiveScore', () => {
    it('should compute a score for metrics without baseline', () => {
      const metrics = makeMetrics()
      const score = computeObjectiveScore(metrics, null, DEFAULT_WEIGHTS)
      expect(typeof score.totalScore).toBe('number')
      expect(score.totalScore).toBeGreaterThanOrEqual(0)
      expect(score.totalScore).toBeLessThanOrEqual(1)
    })

    it('should compute higher score for better pass rate', () => {
      const good = makeMetrics({ passRate: 1.0, passCount: 10, failCount: 0 })
      const bad = makeMetrics({ passRate: 0.5, passCount: 5, failCount: 5 })
      const goodScore = computeObjectiveScore(good, null, DEFAULT_WEIGHTS)
      const badScore = computeObjectiveScore(bad, null, DEFAULT_WEIGHTS)
      expect(goodScore.totalScore).toBeGreaterThan(badScore.totalScore)
    })

    it('should apply duration penalty when candidate is 2x+ slower', () => {
      const candidate = makeMetrics({ avgDurationMs: 5000 })
      const baseline = makeMetrics({ avgDurationMs: 1000 })
      const score = computeObjectiveScore(candidate, baseline, DEFAULT_WEIGHTS)
      expect(score.components.durationPenalty).toBeGreaterThan(0)
    })

    it('should not apply duration penalty when candidate is faster', () => {
      const candidate = makeMetrics({ avgDurationMs: 500 })
      const baseline = makeMetrics({ avgDurationMs: 1000 })
      const score = computeObjectiveScore(candidate, baseline, DEFAULT_WEIGHTS)
      expect(score.components.durationPenalty).toBe(0)
    })

    it('should apply token penalty when candidate uses 2x+ tokens', () => {
      const candidate = makeMetrics({ totalTokens: 15000 })
      const baseline = makeMetrics({ totalTokens: 5000 })
      const score = computeObjectiveScore(candidate, baseline, DEFAULT_WEIGHTS)
      expect(score.components.tokenPenalty).toBeGreaterThan(0)
    })

    it('should apply flakiness penalty when flakiness is set', () => {
      const metrics = makeMetrics({ flakiness: 0.5 })
      const score = computeObjectiveScore(metrics, null, DEFAULT_WEIGHTS)
      expect(score.components.flakinessPenalty).toBeGreaterThan(0)
    })

    it('should include raw metrics in output', () => {
      const metrics = makeMetrics()
      const score = computeObjectiveScore(metrics, null, DEFAULT_WEIGHTS)
      expect(score.raw).toEqual(metrics)
    })

    it('should handle zero metrics gracefully', () => {
      const empty = makeMetrics({
        passRate: 0, totalCases: 0, passCount: 0, failCount: 0,
        avgDurationMs: 0, totalTokens: 0, totalCostUsd: 0,
      })
      const score = computeObjectiveScore(empty, null, DEFAULT_WEIGHTS)
      expect(typeof score.totalScore).toBe('number')
      expect(isFinite(score.totalScore)).toBe(true)
    })
  })

  describe('shouldKeepCandidate', () => {
    function makeScore(overrides?: Partial<ObjectiveScore>): ObjectiveScore {
      return {
        totalScore: 0.7,
        components: {
          assertionScore: 0.28,
          triggerScore: 0.075,
          regressionScore: 0.1,
          judgeScore: 0.05,
          durationPenalty: 0,
          tokenPenalty: 0,
          flakinessPenalty: 0,
          linterPenalty: 0,
        },
        raw: makeMetrics(),
        ...overrides,
      }
    }

    it('should keep candidate with higher total score', () => {
      const candidate = makeScore({ totalScore: 0.9 })
      const baseline = makeScore({ totalScore: 0.7 })
      const result = shouldKeepCandidate(candidate, baseline, {})
      expect(result.keep).toBe(true)
    })

    it('should discard candidate with lower total score', () => {
      const candidate = makeScore({
        totalScore: 0.5,
        raw: makeMetrics({ passRate: 0.5 }),
      })
      const baseline = makeScore({ totalScore: 0.7 })
      const result = shouldKeepCandidate(candidate, baseline, {})
      expect(result.keep).toBe(false)
    })

    it('should reject candidate with pass rate regression', () => {
      const candidate = makeScore({
        totalScore: 0.75,
        raw: makeMetrics({ passRate: 0.7 }),
      })
      const baseline = makeScore({
        totalScore: 0.7,
        raw: makeMetrics({ passRate: 0.8 }),
      })
      const result = shouldKeepCandidate(candidate, baseline, { allowRegression: false })
      expect(result.keep).toBe(false)
      expect(result.reason).toContain('regression')
    })

    it('should allow regression when allowRegression is true', () => {
      const candidate = makeScore({
        totalScore: 0.75,
        raw: makeMetrics({ passRate: 0.7 }),
      })
      const baseline = makeScore({
        totalScore: 0.7,
        raw: makeMetrics({ passRate: 0.8 }),
      })
      const result = shouldKeepCandidate(candidate, baseline, { allowRegression: true })
      expect(result.keep).toBe(true)
    })

    it('should reject candidate with duration blowup', () => {
      const candidate = makeScore({
        totalScore: 0.9,
        raw: makeMetrics({ passRate: 0.9, avgDurationMs: 10000 }),
      })
      const baseline = makeScore({
        totalScore: 0.7,
        raw: makeMetrics({ passRate: 0.8, avgDurationMs: 1000 }),
      })
      const result = shouldKeepCandidate(candidate, baseline, { maxDurationRatio: 3.0 })
      expect(result.keep).toBe(false)
      expect(result.reason).toContain('Duration')
    })

    it('should reject candidate with token blowup', () => {
      const candidate = makeScore({
        totalScore: 0.9,
        raw: makeMetrics({ passRate: 0.9, totalTokens: 50000 }),
      })
      const baseline = makeScore({
        totalScore: 0.7,
        raw: makeMetrics({ passRate: 0.8, totalTokens: 5000 }),
      })
      const result = shouldKeepCandidate(candidate, baseline, { maxTokenRatio: 3.0 })
      expect(result.keep).toBe(false)
      expect(result.reason).toContain('Token')
    })

    it('should respect minImprovement threshold', () => {
      const candidate = makeScore({ totalScore: 0.71, raw: makeMetrics({ passRate: 0.8 }) })
      const baseline = makeScore({ totalScore: 0.7, raw: makeMetrics({ passRate: 0.8 }) })
      const result = shouldKeepCandidate(candidate, baseline, { minImprovement: 0.05 })
      expect(result.keep).toBe(false)
      expect(result.reason).toContain('Insufficient')
    })

    it('should include a reason string', () => {
      const candidate = makeScore({ totalScore: 0.9 })
      const baseline = makeScore({ totalScore: 0.7 })
      const result = shouldKeepCandidate(candidate, baseline, {})
      expect(typeof result.reason).toBe('string')
      expect(result.reason.length).toBeGreaterThan(0)
    })
  })
})
