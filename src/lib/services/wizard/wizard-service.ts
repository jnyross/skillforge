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

export type WizardMode = 'extract' | 'synthesize' | 'hybrid' | 'scratch'

export interface WizardInput {
  mode: WizardMode
  intent: string
  artifacts: WizardArtifact[]
  conversations?: string[]
  corrections?: string[]
  desiredOutputFormat?: string
  safetyConstraints?: string
  allowedTools?: string[]
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
  tags?: string[]
  split: 'train' | 'validation' | 'holdout'
}

const MODE_SYSTEM_PROMPTS: Record<WizardMode, string> = {
  extract: `You are SkillForge's skill creation wizard. The user wants to extract a reusable Claude Code skill from a successful hands-on task. Focus on:
- Identifying the repeatable pattern from the conversation/task
- Extracting the key decision points and steps
- Capturing corrections as gotchas
- Making the skill trigger on similar future requests`,

  synthesize: `You are SkillForge's skill creation wizard. The user wants to synthesize a Claude Code skill from existing artifacts (docs, runbooks, APIs, schemas). Focus on:
- Extracting the coherent unit of work from the artifacts
- Identifying boundaries: when to trigger, when not to trigger
- Translating documentation into actionable skill instructions
- Preserving important details in references/ files`,

  hybrid: `You are SkillForge's skill creation wizard. The user wants to combine task extraction with artifact synthesis. Focus on:
- Using real task experience to ground the skill in practical behavior
- Enriching with documentation and reference materials
- Capturing both the "how it was done" and "how it should be done"
- Building comprehensive trigger and output eval cases`,

  scratch: `You are SkillForge's skill creation wizard. The user wants to create a skill from a description of intent. Focus on:
- Understanding what the user wants the skill to accomplish
- Designing clear triggering conditions
- Writing specific, actionable instructions
- Generating meaningful eval cases to test the skill
WARNING: This skill is being generated without real artifacts. Flag that it should be grounded with real examples before serious use.`,
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

    const systemPrompt = MODE_SYSTEM_PROMPTS[input.mode]
    const userPrompt = buildGenerationPrompt(input)

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseGenerationResponse(text, input)
  } catch {
    return mockGenerate(input)
  }
}

function buildGenerationPrompt(input: WizardInput): string {
  let prompt = `## User Intent\n${input.intent}\n\n`

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
        "name": "Test [scenario]",
        "prompt": "the prompt to test",
        "expectedOutcome": "what good output looks like",
        "assertionType": "contains",
        "assertionValue": "key text that must appear",
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
- Generate at least 2 output/workflow cases
- Assign splits: 60% train, 20% validation, 20% holdout
- Include at least one warning if the skill was generated from scratch without artifacts
- Respond ONLY with valid JSON`

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
            assertionType: c.assertionType || 'contains',
            assertionValue: c.assertionValue,
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
description: "${input.intent.slice(0, 200)}"
---

# ${input.intent.slice(0, 80)}

## Instructions

Based on the user's intent: "${input.intent}"

1. Analyze the request
2. Execute the task
3. Verify the output

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
description: "${input.intent.slice(0, 200)}"
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
  if (input.artifacts.length === 0 && input.conversations?.length === 0) {
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
