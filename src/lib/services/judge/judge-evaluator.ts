/**
 * Judge evaluator service — invokes calibrated judges during eval runs.
 * This bridges the gap between calibrated judges and the eval pipeline,
 * enabling Level 2 (LLM-as-a-judge) evaluations.
 */

import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

export interface JudgeEvalInput {
  judgeId: string
  input: string       // the eval case prompt
  output: string      // the executor's output
  expectedOutcome?: string
}

export interface JudgeEvalResult {
  passed: boolean
  label: 'pass' | 'fail'
  evidence: string
  confidence: number
  chainOfThought?: string
  durationMs: number
}

/**
 * Evaluate an output using a calibrated judge.
 * Only invokes judges that are in 'calibrated' status with an active prompt version.
 */
export async function evaluateWithJudge(input: JudgeEvalInput): Promise<JudgeEvalResult> {
  const start = Date.now()

  const judge = await prisma.judgeDefinition.findUnique({
    where: { id: input.judgeId },
    include: {
      promptVersions: {
        where: { active: true },
        take: 1,
      },
      examples: {
        where: { split: 'train' },
        take: 5,
      },
    },
  })

  if (!judge) {
    return {
      passed: false,
      label: 'fail',
      evidence: `Judge ${input.judgeId} not found`,
      confidence: 0,
      durationMs: Date.now() - start,
    }
  }

  if (judge.status !== 'calibrated') {
    return {
      passed: false,
      label: 'fail',
      evidence: `Judge "${judge.name}" is not calibrated (status: ${judge.status}). Only calibrated judges can be used in eval runs.`,
      confidence: 0,
      durationMs: Date.now() - start,
    }
  }

  const activePrompt = judge.promptVersions[0]
  if (!activePrompt) {
    return {
      passed: false,
      label: 'fail',
      evidence: `Judge "${judge.name}" has no active prompt version`,
      confidence: 0,
      durationMs: Date.now() - start,
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return mockJudgeEval(input, judge.name, start)
  }

  try {
    const client = new Anthropic({ apiKey })

    // Build system prompt with few-shot examples from training split
    let systemPrompt = activePrompt.systemPrompt ||
      `You are a binary judge evaluating outputs. Criterion: ${judge.targetCriterion}`

    // Inject few-shot examples from training split
    if (judge.examples.length > 0) {
      systemPrompt += '\n\nFEW-SHOT EXAMPLES FROM TRAINING DATA:\n'
      for (const ex of judge.examples) {
        systemPrompt += `\nInput: ${ex.input}\nExpected Label: ${ex.expectedLabel}\nHuman Critique: ${ex.humanCritique}\n---`
      }
    }

    // Add chain-of-thought instruction
    systemPrompt += `\n\nIMPORTANT: Think step by step before making your judgment.
Respond with a JSON object:
{
  "chain_of_thought": "Your step-by-step reasoning...",
  "label": "pass" or "fail",
  "evidence": "Brief explanation of your judgment",
  "confidence": 0.0 to 1.0
}`

    // Build user prompt
    const userPrompt = activePrompt.userPromptTemplate
      ? activePrompt.userPromptTemplate
          .replace('{{input}}', input.input)
          .replace('{{output}}', input.output)
          .replace('{{criterion}}', judge.targetCriterion)
          .replace('{{expected}}', input.expectedOutcome || '')
      : `Evaluate this output:\n\nPrompt: ${input.input}\n\nOutput: ${input.output}\n${input.expectedOutcome ? `\nExpected: ${input.expectedOutcome}` : ''}\n\nRespond with JSON: {"chain_of_thought": "...", "label": "pass" or "fail", "evidence": "...", "confidence": 0.0-1.0}`

    const response = await client.messages.create({
      model: judge.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*"label"\s*:\s*"(pass|fail)"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          passed: parsed.label === 'pass',
          label: parsed.label === 'pass' ? 'pass' : 'fail',
          evidence: parsed.evidence || text,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
          chainOfThought: parsed.chain_of_thought || undefined,
          durationMs: Date.now() - start,
        }
      } catch {
        // Fall through
      }
    }

    // Fallback: parse text
    const lowerText = text.toLowerCase()
    const isPassing = lowerText.includes('"pass"') || lowerText.includes('label: pass')
    return {
      passed: isPassing,
      label: isPassing ? 'pass' : 'fail',
      evidence: text.slice(0, 500),
      confidence: 0.5,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      passed: false,
      label: 'fail',
      evidence: `Judge evaluation error: ${err instanceof Error ? err.message : String(err)}`,
      confidence: 0,
      durationMs: Date.now() - start,
    }
  }
}

function mockJudgeEval(input: JudgeEvalInput, judgeName: string, start: number): JudgeEvalResult {
  let hash = 0
  for (let i = 0; i < input.output.length; i++) {
    hash = ((hash << 5) - hash) + input.output.charCodeAt(i)
    hash |= 0
  }
  const isPassing = hash % 3 !== 0
  return {
    passed: isPassing,
    label: isPassing ? 'pass' : 'fail',
    evidence: `Mock judge "${judgeName}" evaluation: ${isPassing ? 'pass' : 'fail'}`,
    confidence: 0.7,
    chainOfThought: 'Mock evaluation — no API key configured',
    durationMs: Date.now() - start,
  }
}
