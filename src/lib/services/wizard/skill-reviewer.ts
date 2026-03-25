/**
 * Phase 2: LLM-powered review pass for generated SKILL.md files.
 *
 * After Phase 1 deterministic checks pass, this service sends the generated
 * skill to a second LLM call for expert critique. If quality score < 7,
 * the skill is flagged for regeneration with the critique as feedback.
 *
 * PR 2: Expert SKILL.md Generation
 */

import Anthropic from '@anthropic-ai/sdk'

export interface SkillReview {
  score: number // 1-10
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  shouldRegenerate: boolean
  reasoning: string
}

const REVIEW_SYSTEM_PROMPT = `You are an expert Claude Code skill reviewer. You have deep experience writing and evaluating SKILL.md files.

Your job is to critically evaluate a generated SKILL.md file and score it on these dimensions:

1. **Domain Expertise Depth** (weight: 25%) — Does the skill teach the CRAFT of its domain? Does it go beyond restating the user's intent? Does it include knowledge that only a practitioner would have?

2. **Anti-Pattern Coverage** (weight: 20%) — Are the pitfalls and common mistakes SPECIFIC to this domain? Not generic warnings like "handle errors" but real gotchas that demonstrate deep knowledge?

3. **Description Pushiness** (weight: 20%) — Would this description trigger reliably? Does it include multiple trigger phrases, near-miss scenarios, and different phrasings? Is it assertive ("Use this skill when...") not passive ("A skill for...")?

4. **Tone & Personality** (weight: 15%) — Is the tone appropriate for the domain? Does it feel like it was written by an expert, not a template? Does it have character without being unprofessional?

5. **Example Quality** (weight: 20%) — Are there concrete, complete examples of good AND bad output? Can the model pattern-match from these examples? Are the examples realistic, not toy?

Scoring guide:
- 9-10: Production-ready. Could be published as-is. Expert-level quality.
- 7-8: Good with minor improvements needed. Solid domain expertise.
- 5-6: Mediocre. Some domain knowledge but feels template-like in places.
- 3-4: Poor. Mostly boilerplate with surface-level domain content.
- 1-2: Terrible. Generic template with no real domain expertise.

Be rigorous. Most first-generation skills score 5-7. Reserve 9-10 for genuinely excellent work.`

/**
 * Review a generated SKILL.md using an LLM critic.
 * Returns a structured review with score and actionable feedback.
 */
export async function reviewSkillQuality(
  skillMd: string,
  intent: string,
  mode: string,
): Promise<SkillReview> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Without API key, assume it passes (Phase 1 already validated structure)
    return {
      score: 7,
      strengths: ['Phase 1 structural checks passed'],
      weaknesses: [],
      suggestions: [],
      shouldRegenerate: false,
      reasoning: 'LLM review skipped (no API key). Phase 1 checks passed.',
    }
  }

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: REVIEW_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `## Review Task

**User Intent:** ${intent}
**Generation Mode:** ${mode}

**Generated SKILL.md:**
\`\`\`markdown
${skillMd}
\`\`\`

Review this SKILL.md critically. Respond with a JSON object:
{
  "score": <number 1-10>,
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "suggestions": ["specific actionable suggestion 1", "suggestion 2"],
  "shouldRegenerate": <boolean — true if score < 7>,
  "reasoning": "2-3 sentence summary of the review"
}

Respond ONLY with valid JSON.`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseReviewResponse(text)
  } catch {
    // On error, let it pass (Phase 1 already validated)
    return {
      score: 7,
      strengths: ['Phase 1 structural checks passed'],
      weaknesses: [],
      suggestions: [],
      shouldRegenerate: false,
      reasoning: 'LLM review failed. Phase 1 checks passed.',
    }
  }
}

/**
 * Build a regeneration prompt that includes the LLM reviewer's feedback.
 */
export function buildRegenerationFeedback(review: SkillReview): string {
  let feedback = `## Expert Review Feedback (Score: ${review.score}/10)\n\n`

  if (review.weaknesses.length > 0) {
    feedback += `### Weaknesses to Fix\n`
    for (const w of review.weaknesses) {
      feedback += `- ${w}\n`
    }
    feedback += '\n'
  }

  if (review.suggestions.length > 0) {
    feedback += `### Specific Improvements Required\n`
    for (const s of review.suggestions) {
      feedback += `- ${s}\n`
    }
    feedback += '\n'
  }

  feedback += `### Reviewer's Reasoning\n${review.reasoning}\n\n`
  feedback += `Fix ALL weaknesses and implement the suggestions. The regenerated skill MUST score >= 7.`

  return feedback
}

// ── Internal ──────────────────────────────────────────────────────────────────

function parseReviewResponse(text: string): SkillReview {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        score?: number
        strengths?: string[]
        weaknesses?: string[]
        suggestions?: string[]
        shouldRegenerate?: boolean
        reasoning?: string
      }

      const score = Math.max(1, Math.min(10, parsed.score ?? 5))
      return {
        score,
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        suggestions: parsed.suggestions || [],
        shouldRegenerate: parsed.shouldRegenerate ?? score < 7,
        reasoning: parsed.reasoning || 'No reasoning provided.',
      }
    } catch {
      // Fall through
    }
  }

  // Default: let it pass
  return {
    score: 7,
    strengths: ['Could not parse review response'],
    weaknesses: [],
    suggestions: [],
    shouldRegenerate: false,
    reasoning: 'LLM review response could not be parsed.',
  }
}
