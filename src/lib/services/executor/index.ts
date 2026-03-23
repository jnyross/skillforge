export { ClaudeCliExecutor } from './claude-cli-executor'
export { MockExecutor } from './mock-executor'
export type { Executor, ExecutorConfig, ExecutorInput, ExecutorOutput } from './types'

import { ClaudeCliExecutor } from './claude-cli-executor'
import { MockExecutor } from './mock-executor'
import type { Executor } from './types'

/**
 * Create an executor by type.
 */
export function createExecutor(type: string): Executor {
  switch (type) {
    case 'claude-cli':
      return new ClaudeCliExecutor()
    case 'mock':
      return new MockExecutor()
    default:
      throw new Error(`Unknown executor type: ${type}`)
  }
}
