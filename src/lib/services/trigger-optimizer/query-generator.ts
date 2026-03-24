/**
 * Trigger Query Generator.
 * Generates 20 realistic trigger eval queries (10 should-trigger, 10 should-not-trigger).
 * Uses Anthropic SDK to generate queries based on the skill description and content.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface TriggerQuery {
  query: string
  shouldTrigger: boolean
  reasoning: string
}

const COMPARATOR_MODEL = process.env.BLIND_COMPARATOR_MODEL || 'claude-sonnet-4-20250514'

/**
 * Generate 20 realistic trigger eval queries for a skill.
 */
export async function generateTriggerQueries(
  skillContent: string,
  description: string,
): Promise<TriggerQuery[]> {
  const client = new Anthropic()

  const prompt = `You are an expert at testing AI skill trigger descriptions. Your job is to generate realistic queries that test whether a skill's trigger description correctly activates the skill.

## Skill Description
${description}

## Skill Content (SKILL.md)
${skillContent}

## Task
Generate exactly 20 trigger evaluation queries:
- 10 queries that SHOULD trigger this skill (positive cases)
- 10 queries that SHOULD NOT trigger this skill (negative cases)

### Requirements for SHOULD-TRIGGER queries:
- Use natural, realistic phrasing a real user would use
- Cover different aspects of the skill's capability
- Include edge cases that are still within scope
- Vary complexity (simple requests, detailed requests, requests with context)
- Do NOT just rephrase the description — imagine real usage scenarios

### Requirements for SHOULD-NOT-TRIGGER queries:
- Use queries that are plausibly similar but outside scope
- Include adjacent topics that the skill should NOT handle
- Include queries that share keywords but have different intent
- Include completely unrelated queries
- Make some queries "tricky" — close to triggering but shouldn't

### Output Format
Return a JSON array of exactly 20 objects:
\`\`\`json
[
  {
    "query": "the user query text",
    "shouldTrigger": true,
    "reasoning": "why this should/shouldn't trigger"
  }
]
\`\`\`

Return ONLY the JSON array, no other text.`

  const response = await client.messages.create({
    model: COMPARATOR_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  // Parse JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error('Failed to parse trigger queries from LLM response')
  }

  const queries: TriggerQuery[] = JSON.parse(jsonMatch[0])

  // Validate we have the right count
  if (!Array.isArray(queries) || queries.length < 10) {
    throw new Error(`Expected at least 10 queries, got ${queries.length}`)
  }

  return queries
}

/**
 * Split trigger queries into train (60%) and test (40%) sets, stratified by shouldTrigger.
 * Returns indices into the original array for each split.
 */
export function splitTriggerCases(
  queries: TriggerQuery[]
): { trainIndices: number[]; testIndices: number[] } {
  const positiveIndices = queries
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.shouldTrigger)
    .map(({ i }) => i)

  const negativeIndices = queries
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => !q.shouldTrigger)
    .map(({ i }) => i)

  // Shuffle each stratum
  shuffle(positiveIndices)
  shuffle(negativeIndices)

  // 60% train, 40% test from each stratum
  const posSplit = Math.ceil(positiveIndices.length * 0.6)
  const negSplit = Math.ceil(negativeIndices.length * 0.6)

  const trainIndices = [
    ...positiveIndices.slice(0, posSplit),
    ...negativeIndices.slice(0, negSplit),
  ]
  const testIndices = [
    ...positiveIndices.slice(posSplit),
    ...negativeIndices.slice(negSplit),
  ]

  return { trainIndices, testIndices }
}

function shuffle(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}
