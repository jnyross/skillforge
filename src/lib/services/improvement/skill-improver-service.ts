/**
 * Skill Improver Service.
 * Applies accepted improvement suggestions to generate a new skill version.
 *
 * Uses a theory-of-mind approach: understands the skill's intent and structure,
 * then applies each accepted suggestion as a targeted edit.
 *
 * Key constraints:
 * - NEVER modifies existing versions (immutable versioning)
 * - Creates a NEW version with the improvements applied
 * - Tracks lineage (new version's parentVersionId = source version)
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ImprovementSuggestion } from './analyzer-service'

// --- Types ---

export interface ImproveSkillInput {
  /** Current SKILL.md content to improve */
  currentSkillContent: string
  /** Accepted suggestions to apply */
  suggestions: ImprovementSuggestion[]
  /** Optional: all files in the skill repo for context */
  additionalFiles?: Array<{ path: string; content: string }>
}

export interface ImprovedSkillOutput {
  /** The new SKILL.md content with improvements applied */
  skillMd: string
  /** Any new or modified files */
  files: Array<{ path: string; content: string; action: 'create' | 'modify' }>
  /** Summary of changes made */
  changesSummary: string[]
  /** Commit message for the new version */
  commitMessage: string
}

// --- Main ---

/**
 * Apply accepted improvement suggestions to generate a new skill version.
 * Uses Anthropic SDK to intelligently apply changes.
 */
export async function improveSkill(input: ImproveSkillInput): Promise<ImprovedSkillOutput> {
  if (input.suggestions.length === 0) {
    throw new Error('No suggestions to apply')
  }

  const client = new Anthropic()
  const model = process.env.SKILL_IMPROVER_MODEL || 'claude-opus-4-6'

  const prompt = buildImproverPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  return parseImproverResponse(text, input)
}

// --- Prompt Construction ---

function buildImproverPrompt(input: ImproveSkillInput): string {
  const suggestionsText = input.suggestions
    .map((s, i) => `${i + 1}. [${s.priority.toUpperCase()}] [${s.category}] ${s.suggestion}\n   Expected impact: ${s.expected_impact}${s.evidence ? `\n   Evidence: ${s.evidence}` : ''}`)
    .join('\n\n')

  const filesContext = input.additionalFiles && input.additionalFiles.length > 0
    ? `\n## Additional Skill Files\n${input.additionalFiles.map(f => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``).join('\n\n')}`
    : ''

  return `You are a Skill Improvement Agent. Your job is to apply specific improvement suggestions to a Claude Code SKILL.md file.

## Current SKILL.md
\`\`\`
${input.currentSkillContent}
\`\`\`
${filesContext}

## Improvements to Apply
${suggestionsText}

## Your Task
Apply ALL the listed improvements to the skill. For each improvement:
1. Understand what the suggestion asks for
2. Find the right place in the SKILL.md to make the change
3. Make the change precisely — don't rewrite unrelated sections
4. If the suggestion requires a new file (script, template, reference), create it

## Rules
- Keep the YAML frontmatter valid
- Keep the description field under 100 words
- Keep SKILL.md under 500 lines total
- If content would exceed 500 lines, split into references/ files
- Preserve existing structure where possible
- Make minimal, targeted changes — don't rewrite the whole skill
- Every change must be traceable to a specific suggestion

## Output Format
Output a single JSON object (no markdown fences):

{
  "skillMd": "The complete new SKILL.md content with all improvements applied",
  "files": [
    { "path": "references/example.md", "content": "file content", "action": "create" | "modify" }
  ],
  "changesSummary": [
    "Applied suggestion 1: [brief description of what changed]",
    "Applied suggestion 2: [brief description of what changed]"
  ],
  "commitMessage": "improve: [brief summary of all changes]"
}

IMPORTANT: Output ONLY the JSON object. No preamble, no explanation, no markdown fences.`
}

// --- Response Parsing ---

function parseImproverResponse(text: string, input: ImproveSkillInput): ImprovedSkillOutput {
  const jsonStr = extractFirstJsonObject(text)
  const parsed = JSON.parse(jsonStr) as {
    skillMd?: string
    files?: Array<{ path?: string; content?: string; action?: string }>
    changesSummary?: string[]
    commitMessage?: string
  }

  return {
    skillMd: parsed.skillMd || input.currentSkillContent,
    files: (parsed.files || [])
      .filter(f => f.path && f.content)
      .map(f => ({
        path: f.path!,
        content: f.content!,
        action: (f.action as 'create' | 'modify') || 'create',
      })),
    changesSummary: parsed.changesSummary || [],
    commitMessage: parsed.commitMessage || `improve: apply ${input.suggestions.length} suggestion(s)`,
  }
}

/**
 * Extract the first complete top-level JSON object from text using depth-counting.
 */
function extractFirstJsonObject(text: string): string {
  const firstBrace = text.indexOf('{')
  if (firstBrace === -1) {
    throw new Error('No JSON object found in improver response')
  }

  let depth = 0
  let inString = false
  let escape = false
  for (let i = firstBrace; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(firstBrace, i + 1)
      }
    }
  }

  throw new Error('Unterminated JSON object in improver response')
}
