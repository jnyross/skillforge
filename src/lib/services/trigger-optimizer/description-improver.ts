/**
 * Description Improver.
 * LLM-powered description rewriter that analyzes failures and generates
 * improved trigger descriptions. Receives failure analysis + history of
 * previous attempts to avoid repeating failed approaches.
 * Enforces 1024-char limit on all descriptions.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { QueryResult } from './trigger-evaluator'

const COMPARATOR_MODEL = process.env.BLIND_COMPARATOR_MODEL || 'claude-opus-4-6'
const MAX_DESCRIPTION_LENGTH = 1024

export interface PreviousAttempt {
  iteration: number
  description: string
  trainScore: number
  testScore: number
  failedQueries: Array<{
    query: string
    shouldTrigger: boolean
    triggerRate: number
  }>
}

/**
 * Generate an improved description based on failure analysis.
 */
export async function improveDescription(
  currentDescription: string,
  skillContent: string,
  failedTrainResults: QueryResult[],
  previousAttempts: PreviousAttempt[],
): Promise<{ description: string; reasoning: string }> {
  const client = new Anthropic()

  const failureAnalysis = failedTrainResults.map(r => {
    const direction = r.shouldTrigger ? 'SHOULD trigger but DID NOT' : 'SHOULD NOT trigger but DID'
    return `- "${r.query}" — ${direction} (trigger rate: ${(r.triggerRate * 100).toFixed(0)}%)`
  }).join('\n')

  const historySection = previousAttempts.length > 0
    ? `## Previous Attempts (DO NOT repeat these approaches)
${previousAttempts.map(a => `### Iteration ${a.iteration}
Description: "${a.description}"
Train score: ${(a.trainScore * 100).toFixed(0)}% | Test score: ${(a.testScore * 100).toFixed(0)}%
Failed queries:
${a.failedQueries.map(q => `  - "${q.query}" (${q.shouldTrigger ? 'false negative' : 'false positive'})`).join('\n')}
`).join('\n')}`
    : ''

  const prompt = `You are an expert at writing trigger descriptions for AI skills. A trigger description tells the AI when to activate a specific skill. Your job is to improve a trigger description based on failure analysis.

## Current Description
"${currentDescription}"

## Skill Content (for context)
${skillContent.slice(0, 2000)}

## Failure Analysis (queries where the current description failed)
${failureAnalysis || 'No failures on training set (but test set may have failures)'}

${historySection}

## Guidelines
1. The description must clearly communicate WHEN the skill should activate
2. Be specific about the scope — what IS and IS NOT in scope
3. Use concrete language, not vague terms
4. Include key differentiating terms that help distinguish this skill from general queries
5. Avoid being too broad (causes false positives) or too narrow (causes false negatives)
6. The description MUST be ${MAX_DESCRIPTION_LENGTH} characters or fewer
7. Do NOT repeat approaches from previous attempts that didn't improve scores
8. Focus on fixing the specific failure patterns identified above
9. Consider adding negative scope markers ("NOT for...") if false positives are common
10. Consider adding more trigger phrases if false negatives are common

## Output Format
Return a JSON object:
\`\`\`json
{
  "description": "the improved description text (max ${MAX_DESCRIPTION_LENGTH} chars)",
  "reasoning": "brief explanation of what you changed and why"
}
\`\`\`

Return ONLY the JSON object, no other text.`

  const response = await client.messages.create({
    model: COMPARATOR_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse improved description from LLM response')
  }

  const result = JSON.parse(jsonMatch[0]) as { description: string; reasoning: string }

  // Enforce character limit
  if (result.description.length > MAX_DESCRIPTION_LENGTH) {
    result.description = result.description.slice(0, MAX_DESCRIPTION_LENGTH)
  }

  return result
}
