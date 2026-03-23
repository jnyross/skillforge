/**
 * Synthetic Data Generation Service
 * Implements dimension-based tuple generation from Hamel Hussain's methodology:
 * 1. Define dimensions (features × scenarios × personas)
 * 2. Generate cross-product tuples
 * 3. LLM-powered expansion to natural language prompts
 * 4. Include/exclude filtering
 * 5. Commit to eval suite with train/validation/holdout splits
 */

import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

export interface DimensionDef {
  name: string
  values: string[]
}

export interface GeneratedTuple {
  dimensionValues: Record<string, string>
  naturalLanguage: string
  expectedOutcome: string
}

/**
 * Generate cross-product tuples from dimensions.
 */
export function generateCrossProduct(dimensions: DimensionDef[]): Record<string, string>[] {
  if (dimensions.length === 0) return []

  let tuples: Record<string, string>[] = [{}]

  for (const dim of dimensions) {
    const expanded: Record<string, string>[] = []
    for (const tuple of tuples) {
      for (const value of dim.values) {
        expanded.push({ ...tuple, [dim.name]: value })
      }
    }
    tuples = expanded
  }

  return tuples
}

/**
 * Expand dimension tuples to natural language prompts using LLM.
 */
export async function expandTuplesToNaturalLanguage(
  tuples: Record<string, string>[],
  skillContext: string
): Promise<GeneratedTuple[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return tuples.map(t => ({
      dimensionValues: t,
      naturalLanguage: `Test case: ${Object.entries(t).map(([k, v]) => `${k}=${v}`).join(', ')}`,
      expectedOutcome: `Expected behavior for: ${Object.values(t).join(', ')}`,
    }))
  }

  const client = new Anthropic({ apiKey })
  const results: GeneratedTuple[] = []

  // Process in batches of 10 to avoid token limits
  const batchSize = 10
  for (let i = 0; i < tuples.length; i += batchSize) {
    const batch = tuples.slice(i, i + batchSize)

    const prompt = `You are generating natural language eval prompts for a Claude Code skill.

Skill context: ${skillContext}

For each dimension tuple below, generate:
1. A natural language prompt that a user might type to trigger this skill with these specific parameters
2. A brief expected outcome description

Tuples:
${batch.map((t, j) => `${j + 1}. ${JSON.stringify(t)}`).join('\n')}

Respond with a JSON array:
[{"index": 1, "prompt": "...", "expected": "..."}, ...]`

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; prompt: string; expected: string }>
        for (let j = 0; j < batch.length; j++) {
          const match = parsed.find(p => p.index === j + 1)
          results.push({
            dimensionValues: batch[j],
            naturalLanguage: match?.prompt || `Test: ${Object.entries(batch[j]).map(([k, v]) => `${k}=${v}`).join(', ')}`,
            expectedOutcome: match?.expected || '',
          })
        }
      } else {
        // Fallback if JSON parsing fails
        for (const t of batch) {
          results.push({
            dimensionValues: t,
            naturalLanguage: `Test case: ${Object.entries(t).map(([k, v]) => `${k}=${v}`).join(', ')}`,
            expectedOutcome: '',
          })
        }
      }
    } catch {
      // On error, use simple template
      for (const t of batch) {
        results.push({
          dimensionValues: t,
          naturalLanguage: `Test case: ${Object.entries(t).map(([k, v]) => `${k}=${v}`).join(', ')}`,
          expectedOutcome: '',
        })
      }
    }
  }

  return results
}

/**
 * Commit synthetic tuples to an eval suite as eval cases.
 * Uses 60/20/20 train/validation/holdout split.
 */
export async function commitTuplesToSuite(
  configId: string,
  suiteId: string
): Promise<{ created: number; errors: string[] }> {
  const tuples = await prisma.syntheticTuple.findMany({
    where: { configId, included: true },
  })

  let created = 0
  const errors: string[] = []

  // Shuffle for random split assignment
  const shuffled = [...tuples].sort(() => Math.random() - 0.5)

  for (let i = 0; i < shuffled.length; i++) {
    const tuple = shuffled[i]
    // 60/20/20 split
    let split: string
    const ratio = i / shuffled.length
    if (ratio < 0.6) split = 'train'
    else if (ratio < 0.8) split = 'validation'
    else split = 'holdout'

    try {
      const key = `synthetic-${tuple.id}`
      const existing = await prisma.evalCase.findFirst({
        where: { evalSuiteId: suiteId, key },
      })
      if (existing) continue

      const evalCase = await prisma.evalCase.create({
        data: {
          evalSuiteId: suiteId,
          key,
          name: `[Synthetic] ${Object.values(JSON.parse(tuple.dimensionValues) as Record<string, string>).join(' / ')}`,
          prompt: tuple.naturalLanguage,
          expectedOutcome: tuple.expectedOutcome,
          split,
          source: 'synthetic',
          tags: 'synthetic',
        },
      })

      // Link tuple to eval case
      await prisma.syntheticTuple.update({
        where: { id: tuple.id },
        data: { evalCaseId: evalCase.id },
      })

      created++
    } catch (err) {
      errors.push(`Failed to create case for tuple ${tuple.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Update config status
  await prisma.syntheticDataConfig.update({
    where: { id: configId },
    data: { status: 'committed' },
  })

  return { created, errors }
}
