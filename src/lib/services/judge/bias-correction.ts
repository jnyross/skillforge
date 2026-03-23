/**
 * Rogan-Gladen bias correction for LLM judge estimates.
 *
 * When an imperfect judge (with known TPR and TNR from calibration)
 * estimates a prevalence rate, the raw estimate is biased.
 * The Rogan-Gladen formula corrects for this bias:
 *
 *   corrected = (apparent_prevalence + TNR - 1) / (TPR + TNR - 1)
 *
 * where:
 *   - apparent_prevalence = fraction the judge labeled as "pass"
 *   - TPR = true positive rate (sensitivity)
 *   - TNR = true negative rate (specificity)
 */

export interface BiasCorrection {
  apparentPrevalence: number
  correctedPrevalence: number
  tpr: number
  tnr: number
  correctionApplied: boolean
  reason?: string
}

/**
 * Apply Rogan-Gladen bias correction to a judge's pass rate estimate.
 *
 * @param apparentPassRate - The raw pass rate from the judge (0-1)
 * @param tpr - True positive rate from calibration (0-1)
 * @param tnr - True negative rate from calibration (0-1)
 * @returns Corrected pass rate and metadata
 */
export function applyRoganGladenCorrection(
  apparentPassRate: number,
  tpr: number,
  tnr: number
): BiasCorrection {
  const denominator = tpr + tnr - 1

  // If TPR + TNR = 1, the judge is no better than random — can't correct
  if (Math.abs(denominator) < 0.001) {
    return {
      apparentPrevalence: apparentPassRate,
      correctedPrevalence: apparentPassRate,
      tpr,
      tnr,
      correctionApplied: false,
      reason: 'Judge performance is equivalent to random (TPR + TNR ≈ 1). Cannot apply correction.',
    }
  }

  const corrected = (apparentPassRate + tnr - 1) / denominator

  // Clamp to [0, 1]
  const clamped = Math.max(0, Math.min(1, corrected))

  return {
    apparentPrevalence: apparentPassRate,
    correctedPrevalence: clamped,
    tpr,
    tnr,
    correctionApplied: true,
    reason: clamped !== corrected
      ? `Corrected value ${corrected.toFixed(4)} was clamped to [0, 1]`
      : undefined,
  }
}
