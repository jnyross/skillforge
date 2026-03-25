/**
 * Trigger Evaluator.
 * Runs trigger eval queries via Claude CLI (`claude -p`) with skill installed.
 * Each query runs 3x for statistical confidence (majority vote).
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'
import Anthropic from '@anthropic-ai/sdk'
import type { TriggerQuery } from './query-generator'

const execFileAsync = promisify(execFile)

export interface QueryResult {
  queryIndex: number
  query: string
  shouldTrigger: boolean
  runs: Array<{ triggered: boolean; durationMs: number }>
  triggerRate: number
  passed: boolean // true if majority vote matches shouldTrigger
}

const RUNS_PER_QUERY = 3

/**
 * Evaluate a set of trigger queries against a skill description.
 * Runs each query 3x via Claude CLI and uses majority vote.
 */
export async function evaluateQueries(
  queries: TriggerQuery[],
  indices: number[],
  skillDescription: string,
  skillContent: string,
): Promise<QueryResult[]> {
  const results: QueryResult[] = []

  for (const idx of indices) {
    const query = queries[idx]
    const runs: Array<{ triggered: boolean; durationMs: number }> = []

    for (let r = 0; r < RUNS_PER_QUERY; r++) {
      const start = Date.now()
      const triggered = await runSingleQuery(query.query, skillDescription, skillContent)
      runs.push({ triggered, durationMs: Date.now() - start })
    }

    const triggerCount = runs.filter(r => r.triggered).length
    const triggerRate = triggerCount / RUNS_PER_QUERY
    const majorityTriggered = triggerRate >= 0.5

    results.push({
      queryIndex: idx,
      query: query.query,
      shouldTrigger: query.shouldTrigger,
      runs,
      triggerRate,
      passed: query.shouldTrigger === majorityTriggered,
    })
  }

  return results
}

/**
 * Compute overall accuracy from query results.
 */
export function computeAccuracy(results: QueryResult[]): number {
  if (results.length === 0) return 0
  const passed = results.filter(r => r.passed).length
  return passed / results.length
}

/**
 * Run a single trigger query via Claude CLI.
 * Creates a temporary workspace with the skill installed and runs the query.
 */
async function runSingleQuery(
  query: string,
  skillDescription: string,
  skillContent: string,
): Promise<boolean> {
  const workspaceId = uuid()
  const workspacePath = path.join(os.tmpdir(), `skillforge-trigger-${workspaceId}`)

  try {
    // Create workspace with skill installed
    await fs.mkdir(path.join(workspacePath, '.claude', 'skills'), { recursive: true })

    // Write SKILL.md with the description being tested
    const updatedContent = updateDescription(skillContent, skillDescription)
    await fs.writeFile(
      path.join(workspacePath, '.claude', 'skills', 'SKILL.md'),
      updatedContent,
      'utf-8'
    )

    // Run claude -p with the query
    const claudePath = process.env.CLAUDE_CLI_PATH || 'claude'
    const { stdout } = await execFileAsync(claudePath, [
      '-p', query,
      '--output-format', 'text',
      '--model', 'claude-opus-4-6',
      '--max-turns', '1',
    ], {
      cwd: workspacePath,
      timeout: 60000,
      env: { ...process.env, HOME: process.env.HOME },
    })

    // Check if the skill was triggered using LLM analysis
    return await detectSkillTriggered(stdout, skillDescription, query)
  } catch (err) {
    // Timeout or error — treat as not triggered
    console.error(`Trigger eval error for query "${query.slice(0, 50)}...":`, err instanceof Error ? err.message : err)
    return false
  } finally {
    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch {
      // Best effort cleanup
    }
  }
}

/**
 * Detect whether a skill was triggered from the CLI output using LLM analysis.
 * Replaces heuristic keyword matching with an LLM call for accurate detection.
 * Uses claude-haiku for speed and cost efficiency.
 */
async function detectSkillTriggered(
  output: string,
  skillDescription: string,
  query: string,
): Promise<boolean> {
  // Fast path: empty or trivially short output is never triggered
  if (output.length < 20) return false

  try {
    const client = new Anthropic()
    const model = process.env.TRIGGER_DETECTION_MODEL || 'claude-opus-4-6'

    const response = await client.messages.create({
      model,
      max_tokens: 128,
      messages: [{
        role: 'user',
        content: `You are a trigger detection judge. Determine if the following output shows evidence that a Claude Code skill was activated and its instructions were followed.

## Skill Description
${skillDescription.slice(0, 500)}

## User Query
${query.slice(0, 300)}

## Claude Output (truncated)
${output.slice(0, 3000)}

## Instructions
Does this output show evidence that the skill was loaded and its instructions influenced the response? Look for:
- Output structure matching what the skill would prescribe
- Domain-specific behavior that goes beyond generic responses
- References to skill-specific patterns, formats, or procedures

Respond with ONLY "YES" or "NO" followed by a single sentence reason.
Example: "YES — output follows the 5-7-5 syllable structure prescribed by the skill."
Example: "NO — output is a generic response unrelated to the skill's domain."`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return text.trim().toUpperCase().startsWith('YES')
  } catch (err) {
    // Fallback: if LLM call fails, use simple length heuristic
    console.warn('[trigger-evaluator] LLM detection failed, falling back to length heuristic:', err instanceof Error ? err.message : String(err))
    return output.length > 200
  }
}

/**
 * Update the description field in a SKILL.md frontmatter.
 */
function updateDescription(content: string, newDescription: string): string {
  if (!content.startsWith('---')) {
    // No frontmatter — prepend it
    return `---\ndescription: ${newDescription}\n---\n\n${content}`
  }

  const endIdx = content.indexOf('---', 3)
  if (endIdx === -1) {
    return `---\ndescription: ${newDescription}\n---\n\n${content}`
  }

  const frontmatter = content.slice(3, endIdx)
  const rest = content.slice(endIdx + 3)

  // Replace or add description in frontmatter
  const lines = frontmatter.split('\n')
  let found = false
  const updatedLines = lines.map(line => {
    if (line.trim().startsWith('description:')) {
      found = true
      return `description: ${newDescription}`
    }
    return line
  })

  if (!found) {
    updatedLines.push(`description: ${newDescription}`)
  }

  return `---${updatedLines.join('\n')}---${rest}`
}

export { updateDescription }
