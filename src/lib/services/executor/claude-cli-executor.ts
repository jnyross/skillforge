import { execFile } from 'child_process'
import { promisify } from 'util'
import type { Executor, ExecutorInput, ExecutorOutput } from './types'

const execFileAsync = promisify(execFile)

interface ClaudeCliResult {
  type: string
  subtype: string
  is_error: boolean
  duration_ms: number
  duration_api_ms?: number
  num_turns: number
  result: string
  stop_reason: string
  session_id: string
  total_cost_usd: number
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

/**
 * Real Claude Code CLI executor.
 * Calls `claude -p` in non-interactive print mode with JSON output.
 */
export class ClaudeCliExecutor implements Executor {
  readonly type = 'claude-cli'

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const args = this.buildArgs(input)
    const timeoutMs = input.config?.timeoutMs ?? 300000 // 5 min default

    try {
      const { stdout } = await execFileAsync('claude', args, {
        cwd: input.workspacePath,
        timeout: timeoutMs,
        maxBuffer: 50 * 1024 * 1024, // 50MB
        env: {
          ...process.env,
          CLAUDE_CODE_SIMPLE: '1',
        },
      })

      const parsed = JSON.parse(stdout.trim()) as ClaudeCliResult

      return {
        sessionId: parsed.session_id || '',
        result: parsed.result || '',
        isError: parsed.is_error || false,
        durationMs: parsed.duration_ms || 0,
        durationApiMs: parsed.duration_api_ms,
        costUsd: parsed.total_cost_usd,
        model: input.config?.model,
        stopReason: parsed.stop_reason,
        usage: parsed.usage ? {
          inputTokens: parsed.usage.input_tokens || 0,
          outputTokens: parsed.usage.output_tokens || 0,
          cacheReadInputTokens: parsed.usage.cache_read_input_tokens,
          cacheCreationInputTokens: parsed.usage.cache_creation_input_tokens,
        } : undefined,
      }
    } catch (err) {
      const error = err as Error & { stderr?: string; code?: string }
      throw new Error(
        `Claude CLI execution failed: ${error.message}${error.stderr ? `\nstderr: ${error.stderr}` : ''}`
      )
    }
  }

  async healthCheck(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const { stdout } = await execFileAsync('claude', ['--version'], {
        timeout: 10000,
      })
      return { ok: true, version: stdout.trim() }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private buildArgs(input: ExecutorInput): string[] {
    const args = [
      '-p', input.prompt,
      '--output-format', 'json',
      '--no-session-persistence',
      '--bare',
    ]

    const config = input.config
    if (config?.model) {
      args.push('--model', config.model)
    }
    if (config?.effort) {
      args.push('--effort', config.effort)
    }
    if (config?.maxTurns) {
      args.push('--max-turns', String(config.maxTurns))
    }
    if (config?.permissionMode) {
      args.push('--permission-mode', config.permissionMode)
    }
    if (config?.allowedTools && config.allowedTools.length > 0) {
      args.push('--allowedTools', ...config.allowedTools)
    }
    if (config?.maxBudgetUsd) {
      args.push('--max-budget-usd', String(config.maxBudgetUsd))
    }

    return args
  }
}
