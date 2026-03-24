/**
 * Baseline Comparison Service.
 * Runs the same prompt WITHOUT the skill installed to establish a baseline.
 * This enables with-skill vs without-skill comparison via blind judging.
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'
import { createExecutor } from '../executor'
import type { ExecutorConfig } from '../executor/types'

export interface BaselineOutput {
  result: string
  durationMs: number
  costUsd: number
  usage: { inputTokens: number; outputTokens: number }
  model: string
  isError: boolean
}

/**
 * Execute a prompt WITHOUT any skill installed (bare Claude).
 * Creates a clean workspace with no skill files so Claude responds
 * using only its base capabilities.
 */
export async function executeBaseline(
  prompt: string,
  executorConfig: ExecutorConfig
): Promise<BaselineOutput> {
  const executor = createExecutor('claude-cli')

  // Create a bare workspace with NO skill files
  const workspaceId = uuid()
  const workspacePath = path.join(os.tmpdir(), `skillforge-baseline-${workspaceId}`)
  await fs.mkdir(workspacePath, { recursive: true })

  try {
    const output = await executor.execute({
      prompt,
      workspacePath,
      config: executorConfig,
    })

    return {
      result: output.result,
      durationMs: output.durationMs,
      costUsd: output.costUsd ?? 0,
      usage: output.usage ?? { inputTokens: 0, outputTokens: 0 },
      model: output.model ?? executorConfig.model ?? '',
      isError: output.isError,
    }
  } finally {
    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch {
      // Best effort cleanup
    }
  }
}
