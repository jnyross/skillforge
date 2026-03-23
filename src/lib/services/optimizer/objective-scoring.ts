/**
 * Objective scoring for optimizer candidates.
 *
 * Default promotion score (from PRD):
 * - weighted deterministic assertions
 * - calibrated judge verdicts
 * - trigger eval performance
 * - regression pass rate
 * - penalty for time/token blowups
 * - penalty for increased flakiness
 * - penalty for linter regressions
 */

export interface ObjectiveWeights {
  assertionPassRate: number
  triggerPerformance: number
  regressionPassRate: number
  judgeAgreement: number
  durationPenalty: number
  tokenPenalty: number
  flakinessPenalty: number
  linterPenalty: number
}

export const DEFAULT_WEIGHTS: ObjectiveWeights = {
  assertionPassRate: 0.35,
  triggerPerformance: 0.15,
  regressionPassRate: 0.20,
  judgeAgreement: 0.10,
  durationPenalty: 0.05,
  tokenPenalty: 0.05,
  flakinessPenalty: 0.05,
  linterPenalty: 0.05,
}

export interface EvalMetrics {
  passRate: number
  totalCases: number
  passCount: number
  failCount: number
  avgDurationMs: number
  totalTokens: number
  totalCostUsd: number
  triggerPrecision?: number
  triggerRecall?: number
  regressionPassRate?: number
  judgeAgreementRate?: number
  linterScore?: number
  flakiness?: number
}

export interface ObjectiveScore {
  totalScore: number
  components: {
    assertionScore: number
    triggerScore: number
    regressionScore: number
    judgeScore: number
    durationPenalty: number
    tokenPenalty: number
    flakinessPenalty: number
    linterPenalty: number
  }
  raw: EvalMetrics
}

/**
 * Compute objective score from eval metrics.
 * Higher is better. Range approximately [0, 1].
 */
export function computeObjectiveScore(
  metrics: EvalMetrics,
  baselineMetrics: EvalMetrics | null,
  weights: ObjectiveWeights = DEFAULT_WEIGHTS
): ObjectiveScore {
  // Assertion pass rate (primary signal)
  const assertionScore = metrics.passRate * weights.assertionPassRate

  // Trigger performance (F1-like from precision and recall)
  const triggerScore = metrics.triggerPrecision != null && metrics.triggerRecall != null
    ? ((metrics.triggerPrecision + metrics.triggerRecall) / 2) * weights.triggerPerformance
    : weights.triggerPerformance * 0.5 // neutral if no trigger data

  // Regression pass rate
  const regressionScore = metrics.regressionPassRate != null
    ? metrics.regressionPassRate * weights.regressionPassRate
    : weights.regressionPassRate * 0.5

  // Judge agreement
  const judgeScore = metrics.judgeAgreementRate != null
    ? metrics.judgeAgreementRate * weights.judgeAgreement
    : weights.judgeAgreement * 0.5

  // Duration penalty: penalize if >2x baseline duration
  let durationPenalty = 0
  if (baselineMetrics && baselineMetrics.avgDurationMs > 0 && metrics.avgDurationMs > 0) {
    const ratio = metrics.avgDurationMs / baselineMetrics.avgDurationMs
    if (ratio > 2) {
      durationPenalty = Math.min((ratio - 2) * 0.1, 1) * weights.durationPenalty
    }
  }

  // Token penalty: penalize if >2x baseline tokens
  let tokenPenalty = 0
  if (baselineMetrics && baselineMetrics.totalTokens > 0 && metrics.totalTokens > 0) {
    const ratio = metrics.totalTokens / baselineMetrics.totalTokens
    if (ratio > 2) {
      tokenPenalty = Math.min((ratio - 2) * 0.1, 1) * weights.tokenPenalty
    }
  }

  // Flakiness penalty
  const flakinessPenalty = metrics.flakiness != null
    ? metrics.flakiness * weights.flakinessPenalty
    : 0

  // Linter penalty: penalize if linter score decreased
  let linterPenalty = 0
  if (baselineMetrics && baselineMetrics.linterScore != null && metrics.linterScore != null) {
    if (metrics.linterScore < baselineMetrics.linterScore) {
      linterPenalty = ((baselineMetrics.linterScore - metrics.linterScore) / 100) * weights.linterPenalty
    }
  }

  const totalScore = assertionScore + triggerScore + regressionScore + judgeScore
    - durationPenalty - tokenPenalty - flakinessPenalty - linterPenalty

  return {
    totalScore: Math.max(0, Math.min(1, totalScore)),
    components: {
      assertionScore,
      triggerScore,
      regressionScore,
      judgeScore,
      durationPenalty,
      tokenPenalty,
      flakinessPenalty,
      linterPenalty,
    },
    raw: metrics,
  }
}

/**
 * Determine if a candidate should be kept based on promotion rules.
 */
export function shouldKeepCandidate(
  candidateScore: ObjectiveScore,
  baselineScore: ObjectiveScore,
  promotionRules: {
    minImprovement?: number
    allowRegression?: boolean
    maxDurationRatio?: number
    maxTokenRatio?: number
  } = {}
): { keep: boolean; reason: string } {
  const minImprovement = promotionRules.minImprovement ?? 0.01
  const allowRegression = promotionRules.allowRegression ?? false
  const maxDurationRatio = promotionRules.maxDurationRatio ?? 3.0
  const maxTokenRatio = promotionRules.maxTokenRatio ?? 3.0

  const improvement = candidateScore.totalScore - baselineScore.totalScore

  // Check for regression
  if (!allowRegression && candidateScore.raw.passRate < baselineScore.raw.passRate) {
    return {
      keep: false,
      reason: `Pass rate regression: ${(candidateScore.raw.passRate * 100).toFixed(1)}% < ${(baselineScore.raw.passRate * 100).toFixed(1)}%`,
    }
  }

  // Check duration ratio
  if (baselineScore.raw.avgDurationMs > 0) {
    const durationRatio = candidateScore.raw.avgDurationMs / baselineScore.raw.avgDurationMs
    if (durationRatio > maxDurationRatio) {
      return {
        keep: false,
        reason: `Duration blowup: ${durationRatio.toFixed(1)}x baseline (max ${maxDurationRatio}x)`,
      }
    }
  }

  // Check token ratio
  if (baselineScore.raw.totalTokens > 0) {
    const tokenRatio = candidateScore.raw.totalTokens / baselineScore.raw.totalTokens
    if (tokenRatio > maxTokenRatio) {
      return {
        keep: false,
        reason: `Token blowup: ${tokenRatio.toFixed(1)}x baseline (max ${maxTokenRatio}x)`,
      }
    }
  }

  // Check minimum improvement
  if (improvement < minImprovement) {
    return {
      keep: false,
      reason: `Insufficient improvement: ${(improvement * 100).toFixed(2)}% < ${(minImprovement * 100).toFixed(2)}% threshold`,
    }
  }

  return {
    keep: true,
    reason: `Score improved by ${(improvement * 100).toFixed(2)}%: ${(baselineScore.totalScore * 100).toFixed(1)}% → ${(candidateScore.totalScore * 100).toFixed(1)}%`,
  }
}
