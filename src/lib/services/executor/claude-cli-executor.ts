import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { promisify } from 'util'
import type { Executor, ExecutorInput, ExecutorOutput } from './types'

const execFileAsync = promisify(execFile)

/**
 * Known paths where the Claude CLI binary may be installed.
 * Checked in order; the first one that exists on disk wins.
 * Falls back to bare 'claude' (PATH lookup) if none match.
 */
const CLAUDE_BIN_CANDIDATES = [
  '/usr/local/bin/claude',
  '/usr/bin/claude',
  '/app/node_modules/.bin/claude',
]

function resolveClaudeBinary(): string {
  for (const candidate of CLAUDE_BIN_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return 'claude'
}

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
  modelUsage?: Record<string, {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens?: number
    cacheCreationInputTokens?: number
    costUSD?: number
  }>
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
      const bin = resolveClaudeBinary()
      const { stdout } = await execFileAsync(bin, args, {
        cwd: input.workspacePath,
        timeout: timeoutMs,
        maxBuffer: 50 * 1024 * 1024, // 50MB
        env: {
          ...process.env,
          CLAUDE_CODE_SIMPLE: '1',
        },
      })

      const parsed = ClaudeCliExecutor.extractJson<ClaudeCliResult>(stdout)

      // Extract model name from modelUsage keys if available
      const modelName = parsed.modelUsage
        ? Object.keys(parsed.modelUsage)[0] ?? input.config?.model
        : input.config?.model

      // Prefer per-model usage from modelUsage for accurate token counts
      const modelUsageEntry = modelName ? parsed.modelUsage?.[modelName] : undefined
      const usage = modelUsageEntry
        ? {
            inputTokens: modelUsageEntry.inputTokens || 0,
            outputTokens: modelUsageEntry.outputTokens || 0,
            cacheReadInputTokens: modelUsageEntry.cacheReadInputTokens,
            cacheCreationInputTokens: modelUsageEntry.cacheCreationInputTokens,
          }
        : parsed.usage
          ? {
              inputTokens: parsed.usage.input_tokens || 0,
              outputTokens: parsed.usage.output_tokens || 0,
              cacheReadInputTokens: parsed.usage.cache_read_input_tokens,
              cacheCreationInputTokens: parsed.usage.cache_creation_input_tokens,
            }
          : undefined

      return {
        sessionId: parsed.session_id || '',
        result: parsed.result || '',
        isError: parsed.is_error || false,
        durationMs: parsed.duration_ms || 0,
        durationApiMs: parsed.duration_api_ms,
        costUsd: parsed.total_cost_usd ?? modelUsageEntry?.costUSD,
        model: modelName,
        stopReason: parsed.stop_reason,
        usage,
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
      const bin = resolveClaudeBinary()
      const { stdout } = await execFileAsync(bin, ['--version'], {
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

  /**
   * Extract a JSON object from stdout that may contain trailing terminal escape codes.
   * Claude CLI can append escape sequences (e.g., "9;4;0;") after the JSON.
   */
  private static extractJson<T>(stdout: string): T {
    const trimmed = stdout.trim()

    // Try parsing the whole string first (fast path)
    try {
      return JSON.parse(trimmed) as T
    } catch {
      // Fall through to extraction
    }

    // Find the JSON object boundaries
    const firstBrace = trimmed.indexOf('{')
    if (firstBrace === -1) {
      throw new Error(`No JSON object found in Claude CLI output: ${trimmed.slice(0, 200)}`)
    }

    // Find the matching closing brace by counting depth
    let depth = 0
    let inString = false
    let escape = false
    for (let i = firstBrace; i < trimmed.length; i++) {
      const ch = trimmed[i]
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
          return JSON.parse(trimmed.slice(firstBrace, i + 1)) as T
        }
      }
    }

    throw new Error(`Unterminated JSON object in Claude CLI output: ${trimmed.slice(0, 200)}`)
  }

  private buildArgs(input: ExecutorInput): string[] {
    const args = [
      '-p', input.prompt,
      '--output-format', 'json',
      '--no-session-persistence',
      '--bare',
      '--add-dir', input.workspacePath,
    ]

    const config = input.config
    if (config?.model) {
      args.push('--model', config.model)
    }
    if (config?.effort) {
      args.push('--effort', config.effort)
    }
    if (config?.maxTurns != null) {
      args.push('--max-turns', String(config.maxTurns))
    }
    if (config?.permissionMode && config.permissionMode !== 'default') {
      args.push('--permission-mode', config.permissionMode)
    }
    if (config?.allowedTools && config.allowedTools.length > 0) {
      args.push('--allowedTools', ...config.allowedTools)
    }
    if (config?.maxBudgetUsd != null) {
      args.push('--max-budget-usd', String(config.maxBudgetUsd))
    }

    return args
  }
}
