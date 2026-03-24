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
      '--model', 'claude-sonnet-4-20250514',
      '--max-turns', '1',
    ], {
      cwd: workspacePath,
      timeout: 60000,
      env: { ...process.env, HOME: process.env.HOME },
    })

    // Check if the skill was triggered by looking at the output
    return detectSkillTriggered(stdout, skillDescription)
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
 * Detect whether a skill was triggered from the CLI output.
 * Looks for indicators that the model used the skill's instructions.
 */
function detectSkillTriggered(output: string, skillDescription: string): boolean {
  const lower = output.toLowerCase()
  const descWords = skillDescription.toLowerCase().split(/\s+/).filter(w => w.length > 4)

  // Strong positive signals
  const positiveSignals = [
    'skill activated',
    'using skill',
    'loaded skill',
    'applying skill',
    'following the skill',
    'as instructed by the skill',
    'according to the skill',
    'skill.md',
  ]

  for (const signal of positiveSignals) {
    if (lower.includes(signal)) return true
  }

  // Check if the output references key terms from the skill description
  // A triggered response typically addresses the skill's domain
  const matchingWords = descWords.filter(w => lower.includes(w))
  const matchRatio = descWords.length > 0 ? matchingWords.length / descWords.length : 0

  // If most of the description keywords appear in output, likely triggered
  if (matchRatio >= 0.6 && output.length > 200) return true

  // If the output is very short or generic, likely not triggered
  if (output.length < 50) return false

  // Default: check if output length suggests substantive work was done
  return output.length > 500
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
