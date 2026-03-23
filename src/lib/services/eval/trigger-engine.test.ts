import { describe, it, expect } from 'vitest'
import {
  detectTrigger,
  evaluateTriggerCase,
  computeTriggerMetrics,
  type TriggerCase,
  type TriggerRunResult,
} from './trigger-engine'

describe('detectTrigger', () => {
  it('should detect trigger from JSON output', () => {
    const result = detectTrigger('{"triggered": true, "confidence": 0.95}')
    expect(result.triggered).toBe(true)
    expect(result.confidence).toBe(0.95)
  })

  it('should detect non-trigger from JSON output', () => {
    const result = detectTrigger('{"triggered": false, "confidence": 0.1}')
    expect(result.triggered).toBe(false)
    expect(result.confidence).toBe(0.1)
  })

  it('should detect trigger from heuristic indicators', () => {
    const result = detectTrigger('The system loaded skill: my-skill and applied it')
    expect(result.triggered).toBe(true)
    expect(result.confidence).toBe(0.7)
  })

  it('should detect non-trigger from heuristic indicators', () => {
    const result = detectTrigger('No matching skill found for this query')
    expect(result.triggered).toBe(false)
    expect(result.confidence).toBe(0.7)
  })

  it('should use length heuristic for ambiguous output', () => {
    const shortResult = detectTrigger('ok')
    expect(shortResult.triggered).toBe(false)
    expect(shortResult.confidence).toBe(0.3)

    const longResult = detectTrigger('a'.repeat(200))
    expect(longResult.triggered).toBe(true)
    expect(longResult.confidence).toBe(0.3)
  })

  it('should handle JSON with triggered field but no confidence', () => {
    const result = detectTrigger('{"triggered": true}')
    expect(result.triggered).toBe(true)
    expect(result.confidence).toBe(0.9)
  })
})

describe('evaluateTriggerCase', () => {
  it('should pass when should-trigger case has high trigger rate', () => {
    const result: TriggerRunResult = {
      caseId: '1',
      query: 'test',
      shouldTrigger: true,
      runs: [
        { triggered: true, confidence: 0.9, durationMs: 100 },
        { triggered: true, confidence: 0.9, durationMs: 100 },
        { triggered: false, confidence: 0.1, durationMs: 100 },
      ],
      triggerRate: 2 / 3,
      passed: true,
    }
    expect(evaluateTriggerCase(result)).toBe(true)
  })

  it('should fail when should-trigger case has low trigger rate', () => {
    const result: TriggerRunResult = {
      caseId: '1',
      query: 'test',
      shouldTrigger: true,
      runs: [
        { triggered: false, confidence: 0.1, durationMs: 100 },
        { triggered: false, confidence: 0.1, durationMs: 100 },
        { triggered: true, confidence: 0.9, durationMs: 100 },
      ],
      triggerRate: 1 / 3,
      passed: false,
    }
    expect(evaluateTriggerCase(result)).toBe(false)
  })

  it('should pass when should-not-trigger case has low trigger rate', () => {
    const result: TriggerRunResult = {
      caseId: '1',
      query: 'test',
      shouldTrigger: false,
      runs: [
        { triggered: false, confidence: 0.1, durationMs: 100 },
        { triggered: false, confidence: 0.1, durationMs: 100 },
        { triggered: false, confidence: 0.1, durationMs: 100 },
      ],
      triggerRate: 0,
      passed: true,
    }
    expect(evaluateTriggerCase(result)).toBe(true)
  })

  it('should fail when should-not-trigger case has high trigger rate', () => {
    const result: TriggerRunResult = {
      caseId: '1',
      query: 'test',
      shouldTrigger: false,
      runs: [
        { triggered: true, confidence: 0.9, durationMs: 100 },
        { triggered: true, confidence: 0.9, durationMs: 100 },
        { triggered: true, confidence: 0.9, durationMs: 100 },
      ],
      triggerRate: 1,
      passed: false,
    }
    expect(evaluateTriggerCase(result)).toBe(false)
  })

  it('should respect custom threshold', () => {
    const result: TriggerRunResult = {
      caseId: '1',
      query: 'test',
      shouldTrigger: true,
      runs: [
        { triggered: true, confidence: 0.9, durationMs: 100 },
        { triggered: false, confidence: 0.1, durationMs: 100 },
        { triggered: false, confidence: 0.1, durationMs: 100 },
      ],
      triggerRate: 1 / 3,
      passed: false,
    }
    // With threshold 0.3, trigger rate of 0.33 passes
    expect(evaluateTriggerCase(result, 0.3)).toBe(true)
  })
})

describe('computeTriggerMetrics', () => {
  const cases: TriggerCase[] = [
    { id: '1', query: 'refactor this', shouldTrigger: true, split: 'train' },
    { id: '2', query: 'add tests', shouldTrigger: true, split: 'train' },
    { id: '3', query: 'what is the weather', shouldTrigger: false, split: 'validation' },
    { id: '4', query: 'fix the bug', shouldTrigger: true, split: 'validation' },
    { id: '5', query: 'tell me a joke', shouldTrigger: false, split: 'holdout' },
  ]

  it('should compute perfect metrics', () => {
    const results: TriggerRunResult[] = [
      { caseId: '1', query: 'refactor this', shouldTrigger: true, triggerRate: 1, passed: true, runs: [] },
      { caseId: '2', query: 'add tests', shouldTrigger: true, triggerRate: 1, passed: true, runs: [] },
      { caseId: '3', query: 'what is the weather', shouldTrigger: false, triggerRate: 0, passed: true, runs: [] },
      { caseId: '4', query: 'fix the bug', shouldTrigger: true, triggerRate: 1, passed: true, runs: [] },
      { caseId: '5', query: 'tell me a joke', shouldTrigger: false, triggerRate: 0, passed: true, runs: [] },
    ]

    const metrics = computeTriggerMetrics(results, cases)
    expect(metrics.totalCases).toBe(5)
    expect(metrics.truePositives).toBe(3)
    expect(metrics.trueNegatives).toBe(2)
    expect(metrics.falsePositives).toBe(0)
    expect(metrics.falseNegatives).toBe(0)
    expect(metrics.precision).toBe(1)
    expect(metrics.recall).toBe(1)
    expect(metrics.f1).toBe(1)
    expect(metrics.overallPassRate).toBe(1)
    expect(metrics.falsePositiveRate).toBe(0)
    expect(metrics.falseNegativeRate).toBe(0)
  })

  it('should compute metrics with failures', () => {
    const results: TriggerRunResult[] = [
      { caseId: '1', query: 'refactor this', shouldTrigger: true, triggerRate: 1, passed: true, runs: [] },
      { caseId: '2', query: 'add tests', shouldTrigger: true, triggerRate: 0, passed: false, runs: [] }, // FN
      { caseId: '3', query: 'what is the weather', shouldTrigger: false, triggerRate: 1, passed: false, runs: [] }, // FP
      { caseId: '4', query: 'fix the bug', shouldTrigger: true, triggerRate: 1, passed: true, runs: [] },
      { caseId: '5', query: 'tell me a joke', shouldTrigger: false, triggerRate: 0, passed: true, runs: [] },
    ]

    const metrics = computeTriggerMetrics(results, cases)
    expect(metrics.truePositives).toBe(2)
    expect(metrics.falseNegatives).toBe(1)
    expect(metrics.trueNegatives).toBe(1)
    expect(metrics.falsePositives).toBe(1)
    expect(metrics.precision).toBeCloseTo(2 / 3, 2)
    expect(metrics.recall).toBeCloseTo(2 / 3, 2)
    expect(metrics.overallPassRate).toBeCloseTo(3 / 5, 2)
    expect(metrics.falsePositiveRate).toBeCloseTo(1 / 2, 2)
    expect(metrics.falseNegativeRate).toBeCloseTo(1 / 3, 2)
  })

  it('should compute per-split metrics', () => {
    const results: TriggerRunResult[] = [
      { caseId: '1', query: 'refactor this', shouldTrigger: true, triggerRate: 1, passed: true, runs: [] },
      { caseId: '2', query: 'add tests', shouldTrigger: true, triggerRate: 1, passed: true, runs: [] },
      { caseId: '3', query: 'what is the weather', shouldTrigger: false, triggerRate: 0, passed: true, runs: [] },
      { caseId: '4', query: 'fix the bug', shouldTrigger: true, triggerRate: 0, passed: false, runs: [] },
      { caseId: '5', query: 'tell me a joke', shouldTrigger: false, triggerRate: 0, passed: true, runs: [] },
    ]

    const metrics = computeTriggerMetrics(results, cases)

    // Train split: 2 cases, both TP
    expect(metrics.perSplit['train'].totalCases).toBe(2)
    expect(metrics.perSplit['train'].passRate).toBe(1)

    // Validation split: 2 cases, 1 TN + 1 FN
    expect(metrics.perSplit['validation'].totalCases).toBe(2)
    expect(metrics.perSplit['validation'].passRate).toBe(0.5)

    // Holdout split: 1 case, 1 TN
    expect(metrics.perSplit['holdout'].totalCases).toBe(1)
    expect(metrics.perSplit['holdout'].passRate).toBe(1)
  })

  it('should handle empty results', () => {
    const metrics = computeTriggerMetrics([], [])
    expect(metrics.totalCases).toBe(0)
    expect(metrics.precision).toBe(0)
    expect(metrics.recall).toBe(0)
    expect(metrics.f1).toBe(0)
    expect(metrics.overallPassRate).toBe(0)
  })
})
