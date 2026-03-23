import { v4 as uuid } from 'uuid'
import type { Executor, ExecutorInput, ExecutorOutput } from './types'

/**
 * Mock executor for testing and development.
 * Returns synthetic results that mimic Claude CLI output shape.
 */
export class MockExecutor implements Executor {
  readonly type = 'mock'

  private delayMs: number
  private shouldFail: boolean
  private customResult?: string

  constructor(options?: {
    delayMs?: number
    shouldFail?: boolean
    customResult?: string
  }) {
    this.delayMs = options?.delayMs ?? 100
    this.shouldFail = options?.shouldFail ?? false
    this.customResult = options?.customResult
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, this.delayMs))

    if (this.shouldFail) {
      throw new Error('Mock executor: simulated failure')
    }

    const sessionId = uuid()
    const result = this.customResult ?? this.generateMockResult(input)

    return {
      sessionId,
      result,
      isError: false,
      durationMs: this.delayMs,
      durationApiMs: Math.floor(this.delayMs * 0.8),
      costUsd: 0.001,
      model: input.config?.model ?? 'mock-model',
      stopReason: 'end_turn',
      usage: {
        inputTokens: input.prompt.length,
        outputTokens: result.length,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      toolEvents: [],
      artifacts: [],
    }
  }

  async healthCheck(): Promise<{ ok: boolean; version?: string; error?: string }> {
    return { ok: true, version: 'mock-1.0.0' }
  }

  private generateMockResult(input: ExecutorInput): string {
    const promptLower = input.prompt.toLowerCase()

    // Check if this is a trigger eval
    if (promptLower.includes('should this skill activate') || promptLower.includes('trigger')) {
      return JSON.stringify({
        triggered: Math.random() > 0.3,
        confidence: Math.random(),
        reason: 'Mock trigger evaluation result',
      })
    }

    // Default: generic successful output
    return `Mock execution completed successfully for prompt: "${input.prompt.slice(0, 100)}..."`
  }
}
