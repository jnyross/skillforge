/**
 * Executor contract tests.
 * Verifies that all executor implementations conform to the Executor interface contract.
 * Uses a fake claude binary for CLI executor testing.
 */
import { describe, it, expect } from 'vitest'
import { MockExecutor } from '../lib/services/executor/mock-executor'
import type { Executor, ExecutorInput, ExecutorOutput } from '../lib/services/executor/types'

function makeInput(overrides?: Partial<ExecutorInput>): ExecutorInput {
  return {
    prompt: 'What is 2+2?',
    workspacePath: '/tmp/test-workspace',
    ...overrides,
  }
}

function assertValidOutput(output: ExecutorOutput) {
  expect(output).toBeDefined()
  expect(typeof output.sessionId).toBe('string')
  expect(output.sessionId.length).toBeGreaterThan(0)
  expect(typeof output.result).toBe('string')
  expect(typeof output.isError).toBe('boolean')
  expect(typeof output.durationMs).toBe('number')
  expect(output.durationMs).toBeGreaterThanOrEqual(0)
}

function assertValidUsage(output: ExecutorOutput) {
  if (output.usage) {
    expect(typeof output.usage.inputTokens).toBe('number')
    expect(typeof output.usage.outputTokens).toBe('number')
    expect(output.usage.inputTokens).toBeGreaterThanOrEqual(0)
    expect(output.usage.outputTokens).toBeGreaterThanOrEqual(0)
  }
}

function assertValidToolEvents(output: ExecutorOutput) {
  if (output.toolEvents) {
    expect(Array.isArray(output.toolEvents)).toBe(true)
    for (const event of output.toolEvents) {
      expect(typeof event.toolName).toBe('string')
      expect(typeof event.input).toBe('string')
      expect(typeof event.output).toBe('string')
    }
  }
}

function assertValidArtifacts(output: ExecutorOutput) {
  if (output.artifacts) {
    expect(Array.isArray(output.artifacts)).toBe(true)
    for (const artifact of output.artifacts) {
      expect(typeof artifact.name).toBe('string')
      expect(typeof artifact.type).toBe('string')
      expect(typeof artifact.content).toBe('string')
    }
  }
}

/**
 * Run the full contract test suite against any Executor implementation.
 */
function runContractTests(name: string, createExecutor: () => Executor) {
  describe(`Executor contract: ${name}`, () => {
    it('should have a non-empty type string', () => {
      const executor = createExecutor()
      expect(typeof executor.type).toBe('string')
      expect(executor.type.length).toBeGreaterThan(0)
    })

    it('should return valid output for a simple prompt', async () => {
      const executor = createExecutor()
      const output = await executor.execute(makeInput())
      assertValidOutput(output)
      assertValidUsage(output)
      assertValidToolEvents(output)
      assertValidArtifacts(output)
    })

    it('should return a non-empty result', async () => {
      const executor = createExecutor()
      const output = await executor.execute(makeInput())
      expect(output.result.length).toBeGreaterThan(0)
    })

    it('should accept skill files in input', async () => {
      const executor = createExecutor()
      const output = await executor.execute(makeInput({
        skillFiles: [{ path: 'SKILL.md', content: '# Test Skill\nDo math.' }],
      }))
      assertValidOutput(output)
    })

    it('should accept config options', async () => {
      const executor = createExecutor()
      const output = await executor.execute(makeInput({
        config: {
          model: 'test-model',
          effort: 'low',
          maxTurns: 3,
          timeoutMs: 30000,
        },
      }))
      assertValidOutput(output)
    })

    it('should report model when available', async () => {
      const executor = createExecutor()
      const output = await executor.execute(makeInput())
      if (output.model) {
        expect(typeof output.model).toBe('string')
        expect(output.model.length).toBeGreaterThan(0)
      }
    })

    it('should report cost as non-negative when available', async () => {
      const executor = createExecutor()
      const output = await executor.execute(makeInput())
      if (output.costUsd !== undefined) {
        expect(output.costUsd).toBeGreaterThanOrEqual(0)
      }
    })

    it('should pass health check', async () => {
      const executor = createExecutor()
      const health = await executor.healthCheck()
      expect(typeof health.ok).toBe('boolean')
      if (health.ok) {
        expect(health.error).toBeUndefined()
      }
      if (health.version) {
        expect(typeof health.version).toBe('string')
      }
    })
  })
}

// Run contract tests for MockExecutor
runContractTests('MockExecutor', () => new MockExecutor({ delayMs: 10 }))

// Run contract tests for MockExecutor with custom result
runContractTests('MockExecutor (custom result)', () => new MockExecutor({
  delayMs: 10,
  customResult: 'Custom test result',
}))

// Test MockExecutor failure mode separately (not part of contract)
describe('MockExecutor failure mode', () => {
  it('should throw when configured to fail', async () => {
    const executor = new MockExecutor({ delayMs: 10, shouldFail: true })
    await expect(executor.execute(makeInput())).rejects.toThrow('Mock executor: simulated failure')
  })

  it('should generate trigger-style output for trigger prompts', async () => {
    const executor = new MockExecutor({ delayMs: 10 })
    const output = await executor.execute(makeInput({
      prompt: 'Should this skill activate for the given input?',
    }))
    expect(output.result).toContain('triggered')
  })
})
