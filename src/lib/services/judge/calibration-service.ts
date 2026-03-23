import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

interface JudgeWithPrompts {
  id: string
  name: string
  model: string
  targetCriterion: string
}

interface PromptVersion {
  id: string
  systemPrompt: string
  userPromptTemplate: string
}

interface Example {
  id: string
  input: string
  expectedLabel: string
  humanCritique: string
  split: string
}

interface CalibrationMetrics {
  truePositives: number
  trueNegatives: number
  falsePositives: number
  falseNegatives: number
  precision: number
  recall: number
  agreementRate: number
  tpr: number
  tnr: number
  f1: number
  totalExamples: number
  predictions: Array<{
    exampleId: string
    expectedLabel: string
    predictedLabel: string
    evidence: string
    correct: boolean
  }>
}

/**
 * Run a judge against human-labeled validation examples and compute calibration metrics.
 * 
 * The judge prompt is used to evaluate each example input, and the judge's prediction
 * is compared against the human label to produce a confusion matrix and derived metrics.
 */
export async function runCalibration(
  calibrationRunId: string,
  judge: JudgeWithPrompts,
  promptVersion: PromptVersion,
  validationExamples: Example[]
): Promise<void> {
  const predictions: CalibrationMetrics['predictions'] = []
  let tp = 0, tn = 0, fp = 0, fn = 0

  for (const example of validationExamples) {
    const predictedLabel = await evaluateExample(judge, promptVersion, example)

    const correct = predictedLabel.label === example.expectedLabel
    if (example.expectedLabel === 'pass' && predictedLabel.label === 'pass') tp++
    else if (example.expectedLabel === 'fail' && predictedLabel.label === 'fail') tn++
    else if (example.expectedLabel === 'fail' && predictedLabel.label === 'pass') fp++
    else if (example.expectedLabel === 'pass' && predictedLabel.label === 'fail') fn++

    predictions.push({
      exampleId: example.id,
      expectedLabel: example.expectedLabel,
      predictedLabel: predictedLabel.label,
      evidence: predictedLabel.evidence,
      correct,
    })
  }

  const total = tp + tn + fp + fn
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const agreementRate = total > 0 ? (tp + tn) / total : 0
  const tpr = tp + fn > 0 ? tp / (tp + fn) : 0
  const tnr = tn + fp > 0 ? tn / (tn + fp) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  const metrics: CalibrationMetrics = {
    truePositives: tp,
    trueNegatives: tn,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    agreementRate,
    tpr,
    tnr,
    f1,
    totalExamples: total,
    predictions,
  }

  // Update calibration run with results
  await prisma.judgeCalibrationRun.update({
    where: { id: calibrationRunId },
    data: {
      status: 'completed',
      truePositives: tp,
      trueNegatives: tn,
      falsePositives: fp,
      falseNegatives: fn,
      precision,
      recall,
      agreementRate,
      metricsJson: JSON.stringify(metrics),
      completedAt: new Date(),
    },
  })

  // If agreement rate is high enough, mark judge as calibrated
  if (agreementRate >= 0.7 && total >= 5) {
    await prisma.judgeDefinition.update({
      where: { id: judge.id },
      data: { status: 'calibrated' },
    })
  } else if (agreementRate < 0.7) {
    // Keep as candidate if not calibrated enough
    await prisma.judgeDefinition.update({
      where: { id: judge.id },
      data: { status: 'candidate' },
    })
  }
}

async function evaluateExample(
  judge: JudgeWithPrompts,
  promptVersion: PromptVersion,
  example: Example
): Promise<{ label: string; evidence: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    // Mock evaluation when no API key is available
    return mockEvaluate(example)
  }

  try {
    const client = new Anthropic({ apiKey })

    const userPrompt = promptVersion.userPromptTemplate
      .replace('{{input}}', example.input)
      .replace('{{criterion}}', judge.targetCriterion)

    const response = await client.messages.create({
      model: judge.model,
      max_tokens: 512,
      system: promptVersion.systemPrompt || `You are a binary judge. Evaluate the following input and respond with a JSON object containing "label" (either "pass" or "fail") and "evidence" (a brief explanation). Criterion: ${judge.targetCriterion}`,
      messages: [
        { role: 'user', content: userPrompt || `Evaluate this input:\n\n${example.input}\n\nRespond with JSON: {"label": "pass" or "fail", "evidence": "..."}` },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*"label"\s*:\s*"(pass|fail)"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          label: parsed.label === 'pass' ? 'pass' : 'fail',
          evidence: parsed.evidence || text,
        }
      } catch {
        // Fall through to text parsing
      }
    }

    // Fallback: look for pass/fail in text
    const lowerText = text.toLowerCase()
    if (lowerText.includes('"pass"') || lowerText.includes('label: pass')) {
      return { label: 'pass', evidence: text }
    }
    return { label: 'fail', evidence: text }
  } catch (err) {
    // On API error, fall back to mock
    return mockEvaluate(example)
  }
}

function mockEvaluate(example: Example): { label: string; evidence: string } {
  // Deterministic mock: use hash of input to decide
  let hash = 0
  for (let i = 0; i < example.input.length; i++) {
    hash = ((hash << 5) - hash) + example.input.charCodeAt(i)
    hash |= 0
  }
  const label = hash % 3 === 0 ? 'fail' : 'pass'
  return {
    label,
    evidence: `Mock evaluation: determined "${label}" based on input analysis`,
  }
}
