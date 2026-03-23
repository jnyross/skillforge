/**
 * Trigger eval engine.
 * Evaluates whether a skill correctly triggers (activates) for given queries.
 *
 * From PRD 8.4:
 * - Run each query multiple times (default 3)
 * - Detect whether the skill was invoked
 * - Compute trigger rate
 * - Aggregate metrics: precision, recall, F1, false positive/negative rates
 */

export interface TriggerCase {
  id: string
  query: string
  shouldTrigger: boolean
  tags?: string
  split: 'train' | 'validation' | 'holdout'
}

export interface TriggerRunResult {
  caseId: string
  query: string
  shouldTrigger: boolean
  runs: Array<{
    triggered: boolean
    confidence: number
    durationMs: number
  }>
  triggerRate: number
  passed: boolean
}

export interface TriggerMetrics {
  totalCases: number
  shouldTriggerCount: number
  shouldNotTriggerCount: number

  // Should-trigger results
  truePositives: number
  falseNegatives: number
  shouldTriggerPassRate: number

  // Should-not-trigger results
  trueNegatives: number
  falsePositives: number
  shouldNotTriggerPassRate: number

  // Aggregate
  precision: number
  recall: number
  f1: number
  overallPassRate: number
  falsePositiveRate: number
  falseNegativeRate: number

  // Per-split breakdown
  perSplit: Record<string, {
    totalCases: number
    passRate: number
    precision: number
    recall: number
    f1: number
  }>
}

/**
 * Detect whether a skill was triggered from executor output.
 * Checks multiple signals in the execution result.
 */
export function detectTrigger(executorResult: string): { triggered: boolean; confidence: number } {
  // Try to parse as JSON first (mock executor returns JSON)
  try {
    const parsed = JSON.parse(executorResult)
    if ('triggered' in parsed && typeof parsed.triggered === 'boolean') {
      return {
        triggered: parsed.triggered,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : (parsed.triggered ? 0.9 : 0.1),
      }
    }
  } catch {
    // Not JSON, try heuristic detection
  }

  // Heuristic: look for common trigger indicators in output
  const resultLower = executorResult.toLowerCase()
  const triggerIndicators = [
    'skill activated',
    'skill triggered',
    'using skill',
    'applying skill',
    'skill:',
    'loaded skill',
  ]
  const nonTriggerIndicators = [
    'no matching skill',
    'skill not found',
    'no skill activated',
    'no applicable skill',
    'skipping skill',
  ]

  for (const indicator of nonTriggerIndicators) {
    if (resultLower.includes(indicator)) {
      return { triggered: false, confidence: 0.7 }
    }
  }

  for (const indicator of triggerIndicators) {
    if (resultLower.includes(indicator)) {
      return { triggered: true, confidence: 0.7 }
    }
  }

  // Default: assume triggered if there's substantial output
  const triggered = executorResult.length > 100
  return { triggered, confidence: 0.3 }
}

/**
 * Evaluate a single trigger case result.
 * A case passes if the trigger rate crosses the threshold in the expected direction.
 */
export function evaluateTriggerCase(
  result: TriggerRunResult,
  threshold: number = 0.5
): boolean {
  if (result.shouldTrigger) {
    // Should trigger: pass if trigger rate >= threshold
    return result.triggerRate >= threshold
  } else {
    // Should NOT trigger: pass if trigger rate < threshold
    return result.triggerRate < threshold
  }
}

/**
 * Compute aggregate trigger metrics from all case results.
 */
export function computeTriggerMetrics(
  results: TriggerRunResult[],
  cases: TriggerCase[],
  threshold: number = 0.5
): TriggerMetrics {
  let truePositives = 0
  let falseNegatives = 0
  let trueNegatives = 0
  let falsePositives = 0

  const caseMap = new Map(cases.map(c => [c.id, c]))
  const perSplitData: Record<string, { tp: number; fn: number; tn: number; fp: number; total: number }> = {}

  for (const result of results) {
    const evalCase = caseMap.get(result.caseId)
    const split = evalCase?.split ?? 'train'

    if (!perSplitData[split]) {
      perSplitData[split] = { tp: 0, fn: 0, tn: 0, fp: 0, total: 0 }
    }
    perSplitData[split].total++

    const triggered = result.triggerRate >= threshold

    if (result.shouldTrigger) {
      if (triggered) {
        truePositives++
        perSplitData[split].tp++
      } else {
        falseNegatives++
        perSplitData[split].fn++
      }
    } else {
      if (triggered) {
        falsePositives++
        perSplitData[split].fp++
      } else {
        trueNegatives++
        perSplitData[split].tn++
      }
    }
  }

  const shouldTriggerCount = truePositives + falseNegatives
  const shouldNotTriggerCount = trueNegatives + falsePositives

  const precision = truePositives + falsePositives > 0
    ? truePositives / (truePositives + falsePositives)
    : 0
  const recall = truePositives + falseNegatives > 0
    ? truePositives / (truePositives + falseNegatives)
    : 0
  const f1 = precision + recall > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0

  // Per-split metrics
  const perSplit: TriggerMetrics['perSplit'] = {}
  for (const [split, data] of Object.entries(perSplitData)) {
    const splitPrecision = data.tp + data.fp > 0 ? data.tp / (data.tp + data.fp) : 0
    const splitRecall = data.tp + data.fn > 0 ? data.tp / (data.tp + data.fn) : 0
    const splitF1 = splitPrecision + splitRecall > 0
      ? 2 * (splitPrecision * splitRecall) / (splitPrecision + splitRecall)
      : 0
    const splitPassRate = data.total > 0
      ? (data.tp + data.tn) / data.total
      : 0

    perSplit[split] = {
      totalCases: data.total,
      passRate: splitPassRate,
      precision: splitPrecision,
      recall: splitRecall,
      f1: splitF1,
    }
  }

  return {
    totalCases: results.length,
    shouldTriggerCount,
    shouldNotTriggerCount,
    truePositives,
    falseNegatives,
    shouldTriggerPassRate: shouldTriggerCount > 0
      ? truePositives / shouldTriggerCount
      : 0,
    trueNegatives,
    falsePositives,
    shouldNotTriggerPassRate: shouldNotTriggerCount > 0
      ? trueNegatives / shouldNotTriggerCount
      : 0,
    precision,
    recall,
    f1,
    overallPassRate: results.length > 0
      ? (truePositives + trueNegatives) / results.length
      : 0,
    falsePositiveRate: shouldNotTriggerCount > 0
      ? falsePositives / shouldNotTriggerCount
      : 0,
    falseNegativeRate: shouldTriggerCount > 0
      ? falseNegatives / shouldTriggerCount
      : 0,
    perSplit,
  }
}
