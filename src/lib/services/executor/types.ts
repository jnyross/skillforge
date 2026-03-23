/**
 * Executor adapter interface for running Claude Code against skill versions.
 * Implementations: ClaudeCliExecutor (real), MockExecutor (testing/dev).
 */

export interface ExecutorConfig {
  model?: string
  effort?: 'low' | 'medium' | 'high' | 'max'
  maxTurns?: number
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  allowedTools?: string[]
  maxBudgetUsd?: number
  timeoutMs?: number
}

export interface ExecutorInput {
  prompt: string
  workspacePath: string
  skillFiles?: Array<{ path: string; content: string }>
  config?: ExecutorConfig
}

export interface ExecutorOutput {
  sessionId: string
  result: string
  isError: boolean
  durationMs: number
  durationApiMs?: number
  costUsd?: number
  model?: string
  stopReason?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens?: number
    cacheCreationInputTokens?: number
  }
  toolEvents?: Array<{
    toolName: string
    input: string
    output: string
  }>
  artifacts?: Array<{
    name: string
    type: string
    content: string
    path?: string
  }>
}

export interface Executor {
  readonly type: string
  execute(input: ExecutorInput): Promise<ExecutorOutput>
  healthCheck(): Promise<{ ok: boolean; version?: string; error?: string }>
}
