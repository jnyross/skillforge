/**
 * Blind Comparator Service.
 * Full port of skill-creator's comparator.md agent.
 *
 * Compares two outputs WITHOUT knowing which skill produced them.
 * Uses Anthropic SDK to generate task-adapted rubric, score each output,
 * and determine a winner with structured reasoning.
 *
 * 7-step process (from skill-creator's comparator.md):
 * 1. Read both outputs (A and B, randomly assigned)
 * 2. Understand the task
 * 3. Generate evaluation rubric (content + structure, task-adapted)
 * 4. Score each output on every criterion with justification
 * 5. Check assertions (if available)
 * 6. Determine winner (rubric primary, assertions secondary)
 * 7. Write results with full rubric and reasoning
 */

import Anthropic from '@anthropic-ai/sdk'

// --- Types ---

export interface ComparisonInput {
  outputA: string
  outputB: string
  evalPrompt: string
  expectations?: string[]
  /** If true, outputA is the skill output. Used for labeling after blind comparison. */
  skillIsA: boolean
}

export interface RubricScores {
  content: Record<string, number>
  structure: Record<string, number>
  content_score: number
  structure_score: number
  overall_score: number
}

export interface OutputQuality {
  score: number
  strengths: string[]
  weaknesses: string[]
}

export interface ExpectationDetail {
  text: string
  passed: boolean
}

export interface ExpectationResults {
  passed: number
  total: number
  pass_rate: number
  details: ExpectationDetail[]
}

export interface ComparisonResult {
  winner: 'A' | 'B' | 'TIE'
  /** After unblinding: 'skill' | 'baseline' | 'TIE' */
  winnerLabel: 'skill' | 'baseline' | 'TIE'
  reasoning: string
  rubric: {
    A: RubricScores
    B: RubricScores
  }
  output_quality: {
    A: OutputQuality
    B: OutputQuality
  }
  expectation_results?: {
    A: ExpectationResults
    B: ExpectationResults
  }
  /** Skill value-add: skill_score - baseline_score */
  delta: number
  /** Which label was randomly assigned to A */
  skillIsA: boolean
}

// --- Main ---

/**
 * Run a blind comparison between two outputs.
 * Randomly assigns A/B labels so the comparator can't tell which is skill vs baseline.
 */
export async function compareBlind(input: ComparisonInput): Promise<ComparisonResult> {
  const client = new Anthropic()
  const model = process.env.BLIND_COMPARATOR_MODEL || 'claude-sonnet-4-20250514'

  const prompt = buildComparatorPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  const parsed = parseComparatorResponse(text)

  // Unblind: determine winner label based on random assignment
  const skillScore = input.skillIsA ? parsed.rubric.A.overall_score : parsed.rubric.B.overall_score
  const baselineScore = input.skillIsA ? parsed.rubric.B.overall_score : parsed.rubric.A.overall_score

  let winnerLabel: 'skill' | 'baseline' | 'TIE'
  if (parsed.winner === 'TIE') {
    winnerLabel = 'TIE'
  } else if ((parsed.winner === 'A' && input.skillIsA) || (parsed.winner === 'B' && !input.skillIsA)) {
    winnerLabel = 'skill'
  } else {
    winnerLabel = 'baseline'
  }

  return {
    ...parsed,
    winnerLabel,
    delta: skillScore - baselineScore,
    skillIsA: input.skillIsA,
  }
}

// --- Prompt Construction ---

function buildComparatorPrompt(input: ComparisonInput): string {
  const expectationsSection = input.expectations && input.expectations.length > 0
    ? `\n## Expectations to Check\n${input.expectations.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
    : ''

  return `You are a Blind Comparator Agent. You will judge which of two outputs better accomplishes an eval task.

CRITICAL: You do NOT know which output used a skill and which is baseline. You must judge purely on output quality and task completion. Stay blind — do not try to infer which skill produced which output.

## Task Prompt (what was asked)
${input.evalPrompt}
${expectationsSection}

## Output A
${input.outputA}

## Output B
${input.outputB}

## Your Process (follow ALL 7 steps)

### Step 1: Read Both Outputs
Examine both outputs carefully. Note the type, structure, and content of each.

### Step 2: Understand the Task
Read the task prompt. Identify:
- What should be produced?
- What qualities matter (accuracy, completeness, format)?
- What would distinguish a good output from a poor one?

### Step 3: Generate Evaluation Rubric
Generate a TASK-ADAPTED rubric with two dimensions. Adapt criteria to the specific task — do NOT use generic criteria.

**Content Rubric** (what the output contains): 3 criteria scored 1-5
**Structure Rubric** (how the output is organized): 3 criteria scored 1-5

### Step 4: Score Each Output
For each output, score every criterion on the rubric (1-5) with brief justification.
- content_score = average of content criteria
- structure_score = average of structure criteria
- overall_score = (content_score + structure_score) * 1.0, scaled to 1-10

### Step 5: Check Assertions
${input.expectations && input.expectations.length > 0
    ? 'Check each expectation against both outputs. This is SECONDARY to the rubric.'
    : 'No expectations provided. Skip this step.'}

### Step 6: Determine Winner
Compare A and B:
1. Primary: Overall rubric score
2. Secondary: Assertion pass rates (if applicable)
3. Tiebreaker: If truly equal, declare TIE

Be decisive — ties should be rare.

### Step 7: Write Results
Output a single JSON object with this EXACT structure (no markdown code fences, no explanation outside JSON):

{
  "winner": "A" | "B" | "TIE",
  "reasoning": "Clear explanation of why the winner was chosen",
  "rubric": {
    "A": {
      "content": { "criterion1_name": score, "criterion2_name": score, "criterion3_name": score },
      "structure": { "criterion1_name": score, "criterion2_name": score, "criterion3_name": score },
      "content_score": number,
      "structure_score": number,
      "overall_score": number
    },
    "B": { ... same structure ... }
  },
  "output_quality": {
    "A": { "score": number, "strengths": [...], "weaknesses": [...] },
    "B": { "score": number, "strengths": [...], "weaknesses": [...] }
  }${input.expectations && input.expectations.length > 0 ? `,
  "expectation_results": {
    "A": { "passed": number, "total": number, "pass_rate": number, "details": [{ "text": "...", "passed": boolean }] },
    "B": { ... same structure ... }
  }` : ''}
}

IMPORTANT: Output ONLY the JSON object. No preamble, no explanation, no markdown fences.`
}

// --- Response Parsing ---

function parseComparatorResponse(text: string): Omit<ComparisonResult, 'winnerLabel' | 'delta' | 'skillIsA'> {
  // Extract JSON from response (may have markdown fences or preamble)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Blind comparator did not return valid JSON')
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    winner: string
    reasoning: string
    rubric: {
      A: RubricScores
      B: RubricScores
    }
    output_quality: {
      A: OutputQuality
      B: OutputQuality
    }
    expectation_results?: {
      A: ExpectationResults
      B: ExpectationResults
    }
  }

  // Validate winner
  const winner = parsed.winner as 'A' | 'B' | 'TIE'
  if (!['A', 'B', 'TIE'].includes(winner)) {
    throw new Error(`Invalid winner value: ${parsed.winner}`)
  }

  return {
    winner,
    reasoning: parsed.reasoning || '',
    rubric: {
      A: normalizeRubricScores(parsed.rubric?.A),
      B: normalizeRubricScores(parsed.rubric?.B),
    },
    output_quality: {
      A: normalizeOutputQuality(parsed.output_quality?.A),
      B: normalizeOutputQuality(parsed.output_quality?.B),
    },
    expectation_results: parsed.expectation_results,
  }
}

function normalizeRubricScores(scores: RubricScores | undefined): RubricScores {
  if (!scores) {
    return { content: {}, structure: {}, content_score: 0, structure_score: 0, overall_score: 0 }
  }
  return {
    content: scores.content || {},
    structure: scores.structure || {},
    content_score: scores.content_score ?? 0,
    structure_score: scores.structure_score ?? 0,
    overall_score: scores.overall_score ?? 0,
  }
}

function normalizeOutputQuality(quality: OutputQuality | undefined): OutputQuality {
  if (!quality) {
    return { score: 0, strengths: [], weaknesses: [] }
  }
  return {
    score: quality.score ?? 0,
    strengths: quality.strengths || [],
    weaknesses: quality.weaknesses || [],
  }
}
