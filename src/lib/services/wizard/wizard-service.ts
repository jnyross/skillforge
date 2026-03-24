/**
 * Wizard service for generating new skills from intent and artifacts.
 *
 * Wizard modes (from PRD §8.10):
 * 1. Extract from a successful hands-on task
 * 2. Synthesize from existing artifacts
 * 3. Hybrid (combine task extraction with artifact synthesis)
 * 4. From scratch (describe intent, generate draft)
 *
 * Outputs:
 * - Initial SKILL.md with valid frontmatter
 * - Recommended references/, scripts/, assets/
 * - Trigger eval suite
 * - Output/workflow eval suite
 * - Baseline assertions
 * - First-run smoke benchmark plan
 */

import Anthropic from '@anthropic-ai/sdk'
import { SKILL_WRITING_PRINCIPLES, EXPERT_MODE_PROMPTS, GENERATION_INSTRUCTIONS } from './skill-writing-guide'
import { validateSkillQuality, buildQualityFeedback } from './quality-validator'
import { reviewSkillQuality, buildRegenerationFeedback } from './skill-reviewer'

export type WizardMode = 'extract' | 'synthesize' | 'hybrid' | 'scratch'

export type FreedomLevel = 'high' | 'medium' | 'low'

export interface WizardInput {
  mode: WizardMode
  intent: string
  artifacts: WizardArtifact[]
  concreteExamples: string[]
  freedomLevel: FreedomLevel
  conversations?: string[]
  corrections?: string[]
  desiredOutputFormat?: string
  safetyConstraints?: string
  allowedTools?: string[]
  /** Interview transcript from conversational intake (PR 1) */
  interviewTranscript?: string
  /** Structured answers extracted from interview (PR 1) */
  extractedAnswers?: Array<{
    questionKey: string
    answer: string
    confidence: string
  }>
}

export interface WizardArtifact {
  name: string
  type: 'doc' | 'runbook' | 'style-guide' | 'api-schema' | 'config' | 'code' | 'example-output' | 'failure-case' | 'review-notes' | 'other'
  content: string
}

export interface GeneratedSkill {
  skillMd: string
  files: Array<{ path: string; content: string }>
  triggerSuite: GeneratedEvalSuite
  outputSuite: GeneratedEvalSuite
  smokePlan: string
  warnings: string[]
  // Quality gate results (PR 2)
  qualityScore?: number
  qualityIssues?: string[]
  reviewScore?: number
  reviewFeedback?: {
    strengths: string[]
    weaknesses: string[]
    suggestions: string[]
    reasoning: string
  }
}

export interface GeneratedEvalSuite {
  name: string
  type: 'trigger' | 'output'
  cases: GeneratedEvalCase[]
}

export interface GeneratedEvalCase {
  key: string
  name: string
  prompt: string
  shouldTrigger?: boolean
  expectedOutcome?: string
  assertionType?: string
  assertionValue?: string
  semanticAssertions?: Array<{
    type: 'semantic'
    description: string
    criterion: string
    dimension: 'structure' | 'content' | 'quality' | 'format'
    discriminating_note?: string
  }>
  tags?: string[]
  split: 'train' | 'validation' | 'holdout'
}

const SHARED_SYSTEM_RULES = `

PROGRESSIVE DISCLOSURE RULES:
- The "description" frontmatter field MUST be under 1024 characters. It is the ONLY thing always loaded into context.
- The SKILL.md body MUST be <500 lines. If content exceeds this, split into references/ files.
- Move variant-specific details, large examples, and lookup tables into references/ files.

${SKILL_WRITING_PRINCIPLES}

${GENERATION_INSTRUCTIONS}

AVAILABLE DESIGN PATTERNS (use when appropriate):

Sequential Workflow: For tasks with ordered steps that must happen in sequence.
  Structure: ## Steps / 1. Step name / - substep / - substep

Conditional Workflow: For tasks with branching logic.
  Structure: ## Decision Points / ### If [condition] / - action / ### Else / - action

Template Output: For tasks that must produce output in a specific format.
  Structure: ## Output Format / \`\`\`template / [template with placeholders] / \`\`\`

Examples Output: For tasks where showing what good looks like is more effective than rules.
  Structure: ## Examples / ### Good / [example] / ### Bad / [example]

Plan-Validate-Execute: For fragile or destructive operations.
  Structure: ## Plan / [what to check] / ## Validate / [dry-run or check] / ## Execute / [actual action]
`

const FREEDOM_LEVEL_INSTRUCTIONS: Record<FreedomLevel, string> = {
  high: `\nSPECIFICITY LEVEL: HIGH FREEDOM
- Write text-based instructions that allow multiple valid approaches.
- Use natural language guidance, not scripts.
- Focus on goals and constraints, not step-by-step procedures.
- Appropriate for: writing style guides, code review, creative tasks.`,
  medium: `\nSPECIFICITY LEVEL: MEDIUM FREEDOM
- Write pseudocode or parameterized scripts for the core steps.
- Allow flexibility in secondary decisions.
- Include key decision points but not every detail.
- Appropriate for: deployment, refactoring, standard workflows.`,
  low: `\nSPECIFICITY LEVEL: LOW FREEDOM
- Write specific, deterministic scripts for fragile operations.
- Minimize degrees of freedom. Include exact commands, paths, and validation checks.
- Every step must be precise and verifiable.
- Appropriate for: database migrations, security patches, compliance checks.`,
}

const MODE_SYSTEM_PROMPTS: Record<WizardMode, string> = {
  extract: EXPERT_MODE_PROMPTS.extract,
  synthesize: EXPERT_MODE_PROMPTS.synthesize,
  hybrid: EXPERT_MODE_PROMPTS.hybrid,
  scratch: EXPERT_MODE_PROMPTS.scratch,
}

/**
 * Generate a complete skill package from user input.
 */
export async function generateSkillFromWizard(input: WizardInput): Promise<GeneratedSkill> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return mockGenerate(input)
  }

  try {
    const client = new Anthropic({ apiKey })
    const systemPrompt = MODE_SYSTEM_PROMPTS[input.mode] + SHARED_SYSTEM_RULES + FREEDOM_LEVEL_INSTRUCTIONS[input.freedomLevel]

    // ── Phase 0: Initial generation (up to 2 retries for Phase 1 failures) ──
    let result: GeneratedSkill | null = null
    let bestResult: GeneratedSkill | null = null
    let qualityFeedback = ''
    const MAX_PHASE1_RETRIES = 2

    for (let attempt = 0; attempt <= MAX_PHASE1_RETRIES; attempt++) {
      const userPrompt = buildGenerationPrompt(input, qualityFeedback)

      const response = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      result = parseGenerationResponse(text, input)

      // ── Phase 1: Deterministic quality checks ──
      const qualityCheck = validateSkillQuality(result.skillMd, input.intent)
      result.qualityScore = qualityCheck.score
      result.qualityIssues = qualityCheck.issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`)

      // Track the best result across all attempts
      if (!bestResult || (result.qualityScore || 0) > (bestResult.qualityScore || 0)) {
        bestResult = result
      }

      if (qualityCheck.passed) {
        bestResult = result // Always prefer a passing result over a higher-scoring failing one
        break // Passed Phase 1, proceed to Phase 2
      }

      if (attempt < MAX_PHASE1_RETRIES) {
        // Build feedback for retry
        qualityFeedback = buildQualityFeedback(qualityCheck)
        result.warnings.push(`Phase 1 quality check failed (attempt ${attempt + 1}). Retrying with feedback.`)
      } else {
        const failWarning = `Phase 1 quality check failed after ${MAX_PHASE1_RETRIES + 1} attempts. Proceeding with best result.`
        result.warnings.push(failWarning)
        if (bestResult && bestResult !== result) {
          bestResult.warnings.push(failWarning)
        }
      }
    }

    // Use the best result from all Phase 1 attempts
    result = bestResult

    if (!result) {
      return mockGenerate(input)
    }

    // ── Phase 1.5: Self-Revision Pass ──
    // The LLM re-reads its own output with fresh eyes and tightens it.
    // This mirrors skill-creator's "look at it with fresh eyes and improve it" principle.
    try {
      const revisionResponse = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: `You previously generated the SKILL.md below. Now re-read it with fresh eyes and improve it.

## Revision Checklist
1. Remove any instruction that wouldn't change the output if deleted — if the agent would do the same thing without this line, cut it
2. Tighten verbose passages — every word must earn its place
3. Ensure every instruction is in imperative form ("Run X", "Check Y"), not wisdom ("It's important to...")
4. Check for duplicate or overlapping instructions and merge them
5. Verify the description triggers broadly enough (includes near-miss scenarios)
6. Confirm anti-patterns are specific to this domain, not generic advice
7. Make sure examples show complete input→output, not just format descriptions

## Current SKILL.md
\`\`\`markdown
${result.skillMd}
\`\`\`

Output the COMPLETE improved SKILL.md (the full file, not a diff). If no improvements are needed, output it unchanged. Output ONLY the SKILL.md content, no JSON wrapper, no explanation.`,
        }],
      })

      const revisedText = revisionResponse.content[0].type === 'text' ? revisionResponse.content[0].text : ''

      if (revisedText.length > 100) {
        // Strip any markdown code fences the LLM may have wrapped it in
        const cleaned = revisedText.replace(/^\s*```(?:markdown|md)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '')

        // Only accept the revision if it still passes Phase 1 quality checks
        const revisedQuality = validateSkillQuality(cleaned, input.intent)
        if (revisedQuality.passed && (revisedQuality.score >= (result.qualityScore || 0))) {
          result.skillMd = cleaned
          result.qualityScore = revisedQuality.score
          result.qualityIssues = revisedQuality.issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`)
          result.warnings.push('Self-revision pass applied (tightened instructions).')
        }
      }
    } catch {
      // Revision is best-effort — don't fail the whole generation
      result.warnings.push('Self-revision pass skipped (LLM call failed).')
    }

    // ── Phase 2: LLM review pass ──
    const review = await reviewSkillQuality(result.skillMd, input.intent, input.mode)
    result.reviewScore = review.score
    result.reviewFeedback = {
      strengths: review.strengths,
      weaknesses: review.weaknesses,
      suggestions: review.suggestions,
      reasoning: review.reasoning,
    }

    if (review.shouldRegenerate) {
      try {
        // One retry with LLM feedback
        const regenerationFeedback = buildRegenerationFeedback(review)
        const retryPrompt = buildGenerationPrompt(input, regenerationFeedback)

        const retryResponse = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: retryPrompt }],
        })

        const retryText = retryResponse.content[0].type === 'text' ? retryResponse.content[0].text : ''
        const retryResult = parseGenerationResponse(retryText, input)

        // Re-validate and re-review
        const retryQuality = validateSkillQuality(retryResult.skillMd, input.intent)
        const retryReview = await reviewSkillQuality(retryResult.skillMd, input.intent, input.mode)

        retryResult.qualityScore = retryQuality.score
        retryResult.qualityIssues = retryQuality.issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`)
        retryResult.reviewScore = retryReview.score
        retryResult.reviewFeedback = {
          strengths: retryReview.strengths,
          weaknesses: retryReview.weaknesses,
          suggestions: retryReview.suggestions,
          reasoning: retryReview.reasoning,
        }

        // Use the better result — but only if retry also passes Phase 1 structural checks
        const originalTotal = (result.qualityScore || 0) + (result.reviewScore || 0)
        const retryTotal = (retryResult.qualityScore || 0) + (retryResult.reviewScore || 0)

        if (retryTotal >= originalTotal && retryQuality.passed) {
          retryResult.warnings.push('Regenerated after expert review feedback (improved).')
          result = retryResult
        } else if (retryTotal > originalTotal && !retryQuality.passed) {
          result.warnings.push('Regeneration scored higher but failed structural checks — keeping original.')
        } else {
          result.warnings.push('Regeneration attempted but original was better.')
        }
      } catch {
        result.warnings.push('Phase 2 retry generation failed — keeping original result.')
      }
    }

    return result
  } catch {
    return mockGenerate(input)
  }
}

function buildGenerationPrompt(input: WizardInput, qualityFeedback?: string): string {
  let prompt = `## User Intent\n${input.intent}\n\n`

  // Concrete examples (Step 1 of Skill Creator methodology)
  if (input.concreteExamples.length > 0) {
    prompt += `## Concrete Usage Examples\nThese are real scenarios where this skill would be used. Ground the skill in these examples:\n`
    for (let i = 0; i < input.concreteExamples.length; i++) {
      prompt += `${i + 1}. ${input.concreteExamples[i]}\n`
    }
    prompt += '\n'
  }

  if (input.artifacts.length > 0) {
    prompt += `## Provided Artifacts\n`
    for (const artifact of input.artifacts) {
      prompt += `### ${artifact.name} (${artifact.type})\n\`\`\`\n${artifact.content.slice(0, 4000)}\n\`\`\`\n\n`
    }
  }

  if (input.conversations && input.conversations.length > 0) {
    prompt += `## Conversation Transcripts\n`
    for (let i = 0; i < input.conversations.length; i++) {
      prompt += `### Conversation ${i + 1}\n\`\`\`\n${input.conversations[i].slice(0, 3000)}\n\`\`\`\n\n`
    }
  }

  if (input.corrections && input.corrections.length > 0) {
    prompt += `## User Corrections / Gotchas\n${input.corrections.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n`
  }

  if (input.desiredOutputFormat) {
    prompt += `## Desired Output Format\n${input.desiredOutputFormat}\n\n`
  }

  if (input.safetyConstraints) {
    prompt += `## Safety Constraints\n${input.safetyConstraints}\n\n`
  }

  if (input.allowedTools && input.allowedTools.length > 0) {
    prompt += `## Allowed Tools\n${input.allowedTools.join(', ')}\n\n`
  }

  // Interview transcript from conversational intake (PR 1)
  if (input.interviewTranscript) {
    prompt += `## Interview Transcript\nThe following is a structured interview with the user about this skill:\n\`\`\`\n${input.interviewTranscript.slice(0, 6000)}\n\`\`\`\n\n`
  }

  if (input.extractedAnswers && input.extractedAnswers.length > 0) {
    prompt += `## Structured Interview Answers\n`
    for (const answer of input.extractedAnswers) {
      prompt += `### ${answer.questionKey} (confidence: ${answer.confidence})\n${answer.answer}\n\n`
    }
  }

  prompt += `## Required Output
Respond with a JSON object containing:
{
  "skillMd": "complete SKILL.md content with valid YAML frontmatter (name, description, etc.) and instruction body",
  "files": [
    { "path": "references/example.md", "content": "..." }
  ],
  "triggerSuite": {
    "name": "Trigger Suite for [skill name]",
    "cases": [
      {
        "key": "should-trigger-1",
        "name": "Should trigger on [scenario]",
        "prompt": "user message that should trigger the skill",
        "shouldTrigger": true,
        "split": "train"
      },
      {
        "key": "should-not-trigger-1",
        "name": "Should NOT trigger on [scenario]",
        "prompt": "user message that should NOT trigger the skill",
        "shouldTrigger": false,
        "split": "train"
      }
    ]
  },
  "outputSuite": {
    "name": "Output Quality Suite for [skill name]",
    "cases": [
      {
        "key": "output-1",
        "name": "Test [scenario] — give this a REALISTIC name like a real user would phrase it",
        "prompt": "A realistic prompt with personality, backstory, and casual language — NOT a sterile test prompt. Example: 'Hey, I need a haiku about debugging a race condition in Go. Make it feel contemplative.'",
        "expectedOutcome": "what good output looks like",
        "assertions": [
          {
            "type": "semantic",
            "description": "What to check, in natural language",
            "criterion": "Specific pass/fail boundary — e.g. 'Output follows 5-7-5 syllable structure with no more than one syllable deviation per line'",
            "dimension": "structure | content | quality | format",
            "discriminating_note": "Why this matters and what a FALSE POSITIVE looks like — e.g. 'A limerick would also have line structure but wrong syllable count'"
          }
        ],
        "split": "train"
      }
    ]
  },
  "smokePlan": "description of what the smoke benchmark should verify",
  "warnings": ["any warnings about the generated skill, e.g. 'Generated without real artifacts — ground with examples before serious use'"]
}

Requirements:
- SKILL.md must have valid YAML frontmatter with at least name and description
- Generate at least 3 trigger cases (mix of should-trigger and should-not-trigger)
- Generate 3-5 FOCUSED output cases (not 8+ padded ones)
- Each output case MUST have realistic prompts with personality, backstory, and casual language
- Each output case MUST use semantic assertions with clear pass/fail criteria
- Each case MUST have multi-dimensional assertions covering at least 2 of: structure, content, quality, format
- Each assertion MUST have a discriminating_note explaining what a false positive looks like
- NO trivial assertions — every assertion must be hard to satisfy without genuinely doing the work
- Assign splits: 60% train, 20% validation, 20% holdout
- Include at least one warning if the skill was generated from scratch without artifacts
- Respond ONLY with valid JSON`

  if (qualityFeedback) {
    prompt += `\n\n## IMPORTANT: Quality Feedback from Previous Attempt\n${qualityFeedback}`
  }

  return prompt
}

function parseGenerationResponse(text: string, input: WizardInput): GeneratedSkill {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        skillMd?: string
        files?: Array<{ path?: string; content?: string }>
        triggerSuite?: {
          name?: string
          cases?: Array<{
            key?: string
            name?: string
            prompt?: string
            shouldTrigger?: boolean
            split?: string
          }>
        }
        outputSuite?: {
          name?: string
          cases?: Array<{
            key?: string
            name?: string
            prompt?: string
            expectedOutcome?: string
            assertionType?: string
            assertionValue?: string
            assertions?: Array<{
              type?: string
              description?: string
              criterion?: string
              dimension?: string
              discriminating_note?: string
            }>
            split?: string
          }>
        }
        smokePlan?: string
        warnings?: string[]
      }

      return {
        skillMd: parsed.skillMd || generateFallbackSkillMd(input),
        files: (parsed.files || [])
          .filter(f => f.path && f.content)
          .map(f => ({ path: f.path!, content: f.content! })),
        triggerSuite: {
          name: parsed.triggerSuite?.name || `Trigger Suite for ${input.intent.slice(0, 40)}`,
          type: 'trigger',
          cases: (parsed.triggerSuite?.cases || []).map((c, i) => ({
            key: c.key || `trigger-${i + 1}`,
            name: c.name || `Trigger case ${i + 1}`,
            prompt: c.prompt || '',
            shouldTrigger: c.shouldTrigger ?? true,
            split: (c.split as 'train' | 'validation' | 'holdout') || 'train',
          })),
        },
        outputSuite: {
          name: parsed.outputSuite?.name || `Output Suite for ${input.intent.slice(0, 40)}`,
          type: 'output',
          cases: (parsed.outputSuite?.cases || []).map((c, i) => ({
            key: c.key || `output-${i + 1}`,
            name: c.name || `Output case ${i + 1}`,
            prompt: c.prompt || '',
            expectedOutcome: c.expectedOutcome,
            assertionType: c.assertions && c.assertions.length > 0 ? 'semantic' : (c.assertionType || 'contains'),
            assertionValue: c.assertionValue,
            semanticAssertions: c.assertions?.filter(a => a.type === 'semantic').map(a => ({
              type: 'semantic' as const,
              description: a.description || '',
              criterion: a.criterion || '',
              dimension: (a.dimension || 'quality') as 'structure' | 'content' | 'quality' | 'format',
              discriminating_note: a.discriminating_note,
            })),
            split: (c.split as 'train' | 'validation' | 'holdout') || 'train',
          })),
        },
        smokePlan: parsed.smokePlan || 'Run each output case once and verify assertions pass.',
        warnings: parsed.warnings || [],
      }
    } catch {
      // Fall through to fallback
    }
  }

  return mockGenerate(input)
}

function generateFallbackSkillMd(input: WizardInput): string {
  const name = input.intent.slice(0, 60).replace(/[^a-zA-Z0-9 -]/g, '').trim().toLowerCase().replace(/\s+/g, '-')
  return `---
name: ${name}
description: ${JSON.stringify(input.intent.slice(0, 200))}
---

# ${input.intent.slice(0, 80)}

## Instructions

Based on the user's intent: "${input.intent}"

1. Understand the user's specific requirements
2. Plan the approach and carry it out step by step
3. Check the output meets all stated requirements

## Gotchas
- This is an auto-generated skill. Review and refine before production use.
`
}

/**
 * Mock generation for when no API key is available.
 */
function mockGenerate(input: WizardInput): GeneratedSkill {
  const name = input.intent.slice(0, 60).replace(/[^a-zA-Z0-9 -]/g, '').trim().toLowerCase().replace(/\s+/g, '-') || 'new-skill'
  const displayName = input.intent.slice(0, 60) || 'New Skill'

  const skillMd = `---
name: ${name}
description: ${JSON.stringify(input.intent.slice(0, 200))}
---

# ${displayName}

## When to use
Use this skill when the user asks to ${input.intent.toLowerCase().slice(0, 100)}.

## Instructions

1. Understand the user's request
2. Plan the approach
3. Execute step by step
4. Validate the output meets requirements

${input.corrections && input.corrections.length > 0 ? `## Gotchas\n${input.corrections.map(c => `- ${c}`).join('\n')}\n` : ''}
## Validation
- Verify output is complete and correct
- Check for edge cases
`

  const files: Array<{ path: string; content: string }> = []

  // If artifacts were provided, create reference files
  if (input.artifacts.length > 0) {
    files.push({
      path: 'references/context.md',
      content: `# Reference Context\n\nThis skill was generated from the following artifacts:\n\n${input.artifacts.map(a => `- **${a.name}** (${a.type})`).join('\n')}\n`,
    })
  }

  const triggerSuite: GeneratedEvalSuite = {
    name: `Trigger Suite for ${displayName}`,
    type: 'trigger',
    cases: [
      {
        key: 'should-trigger-basic',
        name: `Should trigger on basic ${displayName.toLowerCase()} request`,
        prompt: input.intent,
        shouldTrigger: true,
        split: 'train',
      },
      {
        key: 'should-trigger-variation',
        name: `Should trigger on variation`,
        prompt: `Can you help me ${input.intent.toLowerCase().slice(0, 80)}?`,
        shouldTrigger: true,
        split: 'validation',
      },
      {
        key: 'should-not-trigger-unrelated',
        name: 'Should NOT trigger on unrelated request',
        prompt: 'What is the weather today?',
        shouldTrigger: false,
        split: 'train',
      },
      {
        key: 'should-not-trigger-similar',
        name: 'Should NOT trigger on similar but different task',
        prompt: 'Tell me about your capabilities',
        shouldTrigger: false,
        split: 'holdout',
      },
    ],
  }

  const outputSuite: GeneratedEvalSuite = {
    name: `Output Quality Suite for ${displayName}`,
    type: 'output',
    cases: [
      {
        key: 'output-basic',
        name: `Basic ${displayName.toLowerCase()} test`,
        prompt: input.intent,
        expectedOutcome: 'The skill produces correct and complete output',
        assertionType: 'contains',
        assertionValue: name.split('-')[0] || 'result',
        split: 'train',
      },
      {
        key: 'output-edge-case',
        name: 'Edge case handling',
        prompt: `${input.intent} but with minimal input`,
        expectedOutcome: 'The skill handles edge cases gracefully',
        assertionType: 'contains',
        assertionValue: name.split('-')[0] || 'result',
        split: 'validation',
      },
    ],
  }

  const warnings: string[] = []
  if (input.mode === 'scratch') {
    warnings.push('Generated without real artifacts — ground with examples before serious use.')
  }
  if (input.artifacts.length === 0 && (!input.conversations || input.conversations.length === 0)) {
    warnings.push('No artifacts or conversations provided. The generated skill may be generic.')
  }

  return {
    skillMd,
    files,
    triggerSuite,
    outputSuite,
    smokePlan: `Run each output case once with the Claude CLI executor and verify:\n1. The skill triggers correctly\n2. Output assertions pass\n3. No errors or crashes occur`,
    warnings,
  }
}
