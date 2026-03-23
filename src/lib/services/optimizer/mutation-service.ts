/**
 * Mutation service for the optimizer.
 * Uses the Anthropic API to generate skill mutations (rewrites, structural changes, etc.).
 *
 * Mutation modes (from PRD):
 * 1. description-only — rewrite the description field
 * 2. instruction-only — rewrite or tighten instructions
 * 3. structure — split references, move logic to scripts, add templates/gotchas/checklists
 * 4. safety-control — frontmatter tightening, tool restrictions, validation loops
 * 5. full-skill — full skill mutation combining multiple operators
 * 6. research-assisted — scans best practices, prior failures, critiques before proposing edits
 */

import Anthropic from '@anthropic-ai/sdk'

export type MutationMode =
  | 'description-only'
  | 'instruction-only'
  | 'structure'
  | 'safety-control'
  | 'full-skill'
  | 'research-assisted'

export interface MutationOperator {
  name: string
  description: string
}

export const MUTATION_OPERATORS: MutationOperator[] = [
  { name: 'rewrite-description', description: 'Rewrite the description field for better triggering' },
  { name: 'tighten-instructions', description: 'Rewrite or tighten instructions for clarity' },
  { name: 'add-examples', description: 'Add concrete examples to improve understanding' },
  { name: 'remove-examples', description: 'Remove redundant or misleading examples' },
  { name: 'add-gotchas', description: 'Add gotchas from recurring critiques or failures' },
  { name: 'add-templates', description: 'Add templates for structured output' },
  { name: 'add-validation-loops', description: 'Add validation loops for error checking' },
  { name: 'move-to-references', description: 'Move verbose sections into references/ files' },
  { name: 'update-scripts', description: 'Write or update bundled validator/helper scripts' },
  { name: 'update-frontmatter', description: 'Add or remove frontmatter fields' },
  { name: 'create-subflows', description: 'Create shorter, more coherent subflows' },
  { name: 'convert-defaults', description: 'Convert menu-like instructions into defaults' },
  { name: 'plan-validate-execute', description: 'Transform fragile tasks into plan-validate-execute workflows' },
]

export interface MutationRequest {
  mode: MutationMode
  currentSkillContent: string
  currentFiles: Array<{ path: string; content: string }>
  evalFeedback?: string
  humanCritiques?: string[]
  failureExamples?: string[]
  targetCriterion?: string
}

export interface MutationResult {
  mutationType: string
  rationale: string
  mutations: Array<{
    operator: string
    target: string
    beforeSnippet: string
    afterSnippet: string
  }>
  newSkillContent: string
  newFiles: Array<{ path: string; content: string }>
}

const MODE_PROMPTS: Record<MutationMode, string> = {
  'description-only': `You are improving a Claude Code skill. Focus ONLY on rewriting the "description" field in the YAML frontmatter to improve triggering quality. The description should be specific, actionable, and clearly indicate when this skill should activate. Do not change anything else.`,

  'instruction-only': `You are improving a Claude Code skill. Focus ONLY on the instruction body (after the YAML frontmatter). Tighten instructions for clarity, remove ambiguity, improve step ordering, and make the skill more effective. Do not change the frontmatter or add new files.`,

  'structure': `You are improving a Claude Code skill's structure. Consider: splitting verbose instructions into reference files, moving repeated logic to scripts, adding templates or checklists, creating gotcha sections. You may create new files in references/ or scripts/ directories.`,

  'safety-control': `You are improving a Claude Code skill's safety and control mechanisms. Focus on: tightening frontmatter (tool restrictions, allowed commands), adding validation loops, adding error checking, restricting dangerous operations. Make the skill safer without reducing its effectiveness.`,

  'full-skill': `You are performing a full skill mutation. You may change any aspect: description, instructions, structure, safety controls, examples, templates, scripts. Aim for the most impactful improvements based on the feedback provided.`,

  'research-assisted': `You are performing a research-assisted skill improvement. Before proposing changes, analyze the provided failure examples, critiques, and best practices. Then propose targeted, evidence-based improvements. Every change must be justified by specific evidence from the feedback.`,
}

/**
 * Generate a skill mutation using the Anthropic API.
 */
export async function generateMutation(request: MutationRequest): Promise<MutationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return mockMutation(request)
  }

  try {
    const client = new Anthropic({ apiKey })

    const systemPrompt = MODE_PROMPTS[request.mode]
    const userPrompt = buildUserPrompt(request)

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseMutationResponse(text, request)
  } catch {
    return mockMutation(request)
  }
}

function buildUserPrompt(request: MutationRequest): string {
  let prompt = `## Current SKILL.md\n\`\`\`markdown\n${request.currentSkillContent}\n\`\`\`\n\n`

  if (request.currentFiles.length > 0) {
    prompt += `## Associated Files\n`
    for (const file of request.currentFiles) {
      prompt += `### ${file.path}\n\`\`\`\n${file.content.slice(0, 2000)}\n\`\`\`\n\n`
    }
  }

  if (request.evalFeedback) {
    prompt += `## Eval Feedback\n${request.evalFeedback}\n\n`
  }

  if (request.humanCritiques && request.humanCritiques.length > 0) {
    prompt += `## Human Critiques\n${request.humanCritiques.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n`
  }

  if (request.failureExamples && request.failureExamples.length > 0) {
    prompt += `## Failure Examples\n${request.failureExamples.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n`
  }

  prompt += `## Instructions
Produce a JSON response with the following structure:
{
  "rationale": "Brief explanation of why these changes improve the skill",
  "mutations": [
    {
      "operator": "one of: ${MUTATION_OPERATORS.map(o => o.name).join(', ')}",
      "target": "what is being changed (e.g., 'description', 'step 3', 'references/api.md')",
      "beforeSnippet": "the original text being replaced (short excerpt)",
      "afterSnippet": "the new text (short excerpt)"
    }
  ],
  "newSkillContent": "the complete updated SKILL.md content",
  "newFiles": [
    { "path": "references/example.md", "content": "file content" }
  ]
}

Only include newFiles if you are creating or modifying files other than SKILL.md.
Respond ONLY with valid JSON.`

  return prompt
}

function parseMutationResponse(text: string, request: MutationRequest): MutationResult {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        rationale?: string
        mutations?: Array<{
          operator?: string
          target?: string
          beforeSnippet?: string
          afterSnippet?: string
        }>
        newSkillContent?: string
        newFiles?: Array<{ path?: string; content?: string }>
      }
      return {
        mutationType: request.mode,
        rationale: parsed.rationale || 'Mutation applied',
        mutations: (parsed.mutations || []).map(m => ({
          operator: m.operator || request.mode,
          target: m.target || 'SKILL.md',
          beforeSnippet: m.beforeSnippet || '',
          afterSnippet: m.afterSnippet || '',
        })),
        newSkillContent: parsed.newSkillContent || request.currentSkillContent,
        newFiles: (parsed.newFiles || []).map(f => ({
          path: f.path || '',
          content: f.content || '',
        })).filter(f => f.path),
      }
    } catch {
      // Fall through to default
    }
  }

  // Fallback: return the text as a single mutation
  return {
    mutationType: request.mode,
    rationale: 'LLM response could not be parsed as structured JSON',
    mutations: [{
      operator: request.mode,
      target: 'SKILL.md',
      beforeSnippet: request.currentSkillContent.slice(0, 100),
      afterSnippet: text.slice(0, 100),
    }],
    newSkillContent: request.currentSkillContent,
    newFiles: [],
  }
}

/**
 * Mock mutation for when no API key is available or API fails.
 * Applies a simple deterministic transformation.
 */
function mockMutation(request: MutationRequest): MutationResult {
  const content = request.currentSkillContent

  // Apply a simple mock transformation based on mode
  let newContent = content
  let rationale = 'Mock mutation applied'
  const mutations: MutationResult['mutations'] = []

  switch (request.mode) {
    case 'description-only': {
      // Add "(optimized)" to the description in frontmatter
      const descMatch = content.match(/^description:\s*(.+)$/m)
      if (descMatch) {
        const oldDesc = descMatch[1].trim()
        const newDesc = `${oldDesc} (optimized v${Date.now() % 1000})`
        newContent = content.replace(descMatch[0], `description: ${newDesc}`)
        rationale = 'Appended optimization marker to description for better triggering'
        mutations.push({
          operator: 'rewrite-description',
          target: 'description',
          beforeSnippet: oldDesc,
          afterSnippet: newDesc,
        })
      }
      break
    }
    case 'instruction-only': {
      // Add a validation step at the end
      const addition = '\n\n## Validation\n- Verify output meets requirements before finalizing'
      newContent = content + addition
      rationale = 'Added validation step to instructions'
      mutations.push({
        operator: 'tighten-instructions',
        target: 'instructions',
        beforeSnippet: '(end of file)',
        afterSnippet: addition.trim(),
      })
      break
    }
    default: {
      // Generic: add a comment
      const addition = `\n\n<!-- Optimized by SkillForge optimizer (mode: ${request.mode}) -->`
      newContent = content + addition
      rationale = `Applied ${request.mode} optimization`
      mutations.push({
        operator: request.mode,
        target: 'SKILL.md',
        beforeSnippet: '(end of file)',
        afterSnippet: addition.trim(),
      })
      break
    }
  }

  return {
    mutationType: request.mode,
    rationale,
    mutations,
    newSkillContent: newContent,
    newFiles: [],
  }
}
