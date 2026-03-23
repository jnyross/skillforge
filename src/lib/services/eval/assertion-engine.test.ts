import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  runAssertion,
  runAssertions,
  computeSimilarity,
  getNestedValue,
  validateJsonSchema,
} from './assertion-engine'

let workspacePath: string

beforeEach(async () => {
  workspacePath = path.join(os.tmpdir(), `test-workspace-${Date.now()}`)
  await fs.mkdir(workspacePath, { recursive: true })
})

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true })
})

const baseContext = () => ({
  workspacePath,
  stdout: '',
  stderr: '',
  result: '',
})

describe('assertion-engine', () => {
  describe('file_exists', () => {
    it('should pass when file exists', async () => {
      await fs.writeFile(path.join(workspacePath, 'output.txt'), 'hello')
      const result = await runAssertion(
        { type: 'file_exists', target: 'output.txt' },
        baseContext()
      )
      expect(result.passed).toBe(true)
      expect(result.evidence).toContain('File exists')
    })

    it('should fail when file does not exist', async () => {
      const result = await runAssertion(
        { type: 'file_exists', target: 'missing.txt' },
        baseContext()
      )
      expect(result.passed).toBe(false)
      expect(result.evidence).toContain('File not found')
    })

    it('should fail with no target specified', async () => {
      const result = await runAssertion(
        { type: 'file_exists' },
        baseContext()
      )
      expect(result.passed).toBe(false)
      expect(result.evidence).toContain('No target file path')
    })

    it('should reject path traversal', async () => {
      const result = await runAssertion(
        { type: 'file_exists', target: '../../etc/passwd' },
        baseContext()
      )
      expect(result.passed).toBe(false)
      expect(result.evidence).toContain('Path traversal')
    })
  })

  describe('file_content', () => {
    it('should pass when file contains expected content', async () => {
      await fs.writeFile(path.join(workspacePath, 'output.txt'), 'hello world')
      const result = await runAssertion(
        { type: 'file_content', target: 'output.txt', expected: 'hello' },
        baseContext()
      )
      expect(result.passed).toBe(true)
    })

    it('should fail when file does not contain expected content', async () => {
      await fs.writeFile(path.join(workspacePath, 'output.txt'), 'goodbye')
      const result = await runAssertion(
        { type: 'file_content', target: 'output.txt', expected: 'hello' },
        baseContext()
      )
      expect(result.passed).toBe(false)
    })

    it('should support case-insensitive matching', async () => {
      await fs.writeFile(path.join(workspacePath, 'output.txt'), 'HELLO WORLD')
      const result = await runAssertion(
        { type: 'file_content', target: 'output.txt', expected: 'hello', options: { caseSensitive: false } },
        baseContext()
      )
      expect(result.passed).toBe(true)
    })

    it('should support fuzzy matching', async () => {
      await fs.writeFile(path.join(workspacePath, 'output.txt'), 'the quick brown fox')
      const result = await runAssertion(
        { type: 'file_content', target: 'output.txt', expected: 'the quick brown dog', options: { fuzzyThreshold: 0.5 } },
        baseContext()
      )
      expect(result.passed).toBe(true)
    })
  })

  describe('json_valid', () => {
    it('should pass for valid JSON result', async () => {
      const result = await runAssertion(
        { type: 'json_valid' },
        { ...baseContext(), result: '{"key": "value"}' }
      )
      expect(result.passed).toBe(true)
    })

    it('should fail for invalid JSON result', async () => {
      const result = await runAssertion(
        { type: 'json_valid' },
        { ...baseContext(), result: 'not json' }
      )
      expect(result.passed).toBe(false)
    })

    it('should check JSON file when target is specified', async () => {
      await fs.writeFile(path.join(workspacePath, 'data.json'), '{"valid": true}')
      const result = await runAssertion(
        { type: 'json_valid', target: 'data.json' },
        baseContext()
      )
      expect(result.passed).toBe(true)
    })

    it('should check nested field existence', async () => {
      const result = await runAssertion(
        { type: 'json_valid', options: { field: 'data.items' } },
        { ...baseContext(), result: '{"data": {"items": [1,2,3]}}' }
      )
      expect(result.passed).toBe(true)
    })

    it('should fail when nested field is missing', async () => {
      const result = await runAssertion(
        { type: 'json_valid', options: { field: 'data.missing' } },
        { ...baseContext(), result: '{"data": {"items": [1,2,3]}}' }
      )
      expect(result.passed).toBe(false)
    })
  })

  describe('json_schema', () => {
    it('should pass when JSON matches schema', async () => {
      const result = await runAssertion(
        {
          type: 'json_schema',
          expected: {
            type: 'object',
            required: ['name', 'age'],
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        },
        { ...baseContext(), result: '{"name": "Alice", "age": 30}' }
      )
      expect(result.passed).toBe(true)
    })

    it('should fail when required field is missing', async () => {
      const result = await runAssertion(
        {
          type: 'json_schema',
          expected: {
            type: 'object',
            required: ['name', 'age'],
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        },
        { ...baseContext(), result: '{"name": "Alice"}' }
      )
      expect(result.passed).toBe(false)
      expect(result.evidence).toContain('age')
    })

    it('should fail when type is wrong', async () => {
      const result = await runAssertion(
        {
          type: 'json_schema',
          expected: {
            type: 'object',
            properties: {
              count: { type: 'number' },
            },
          },
        },
        { ...baseContext(), result: '{"count": "not a number"}' }
      )
      expect(result.passed).toBe(false)
    })
  })

  describe('contains', () => {
    it('should pass when result contains expected string', async () => {
      const result = await runAssertion(
        { type: 'contains', expected: 'success' },
        { ...baseContext(), result: 'The operation was a success!' }
      )
      expect(result.passed).toBe(true)
    })

    it('should fail when result does not contain expected string', async () => {
      const result = await runAssertion(
        { type: 'contains', expected: 'success' },
        { ...baseContext(), result: 'The operation failed.' }
      )
      expect(result.passed).toBe(false)
    })

    it('should check stdout when target is stdout', async () => {
      const result = await runAssertion(
        { type: 'contains', target: 'stdout', expected: 'output' },
        { ...baseContext(), stdout: 'some output here', result: '' }
      )
      expect(result.passed).toBe(true)
    })
  })

  describe('not_contains', () => {
    it('should pass when result does not contain forbidden string', async () => {
      const result = await runAssertion(
        { type: 'not_contains', expected: 'error' },
        { ...baseContext(), result: 'All good!' }
      )
      expect(result.passed).toBe(true)
    })

    it('should fail when result contains forbidden string', async () => {
      const result = await runAssertion(
        { type: 'not_contains', expected: 'error' },
        { ...baseContext(), result: 'An error occurred' }
      )
      expect(result.passed).toBe(false)
    })
  })

  describe('regex', () => {
    it('should pass when result matches pattern', async () => {
      const result = await runAssertion(
        { type: 'regex', expected: '\\d{3}-\\d{4}' },
        { ...baseContext(), result: 'Call 555-1234 now' }
      )
      expect(result.passed).toBe(true)
    })

    it('should fail when result does not match pattern', async () => {
      const result = await runAssertion(
        { type: 'regex', expected: '^\\d+$' },
        { ...baseContext(), result: 'not a number' }
      )
      expect(result.passed).toBe(false)
    })

    it('should handle invalid regex gracefully', async () => {
      const result = await runAssertion(
        { type: 'regex', expected: '[invalid' },
        { ...baseContext(), result: 'test' }
      )
      expect(result.passed).toBe(false)
      expect(result.evidence).toContain('Invalid regex')
    })
  })

  describe('row_count', () => {
    it('should pass when row count matches', async () => {
      const result = await runAssertion(
        { type: 'row_count', expected: 3 },
        { ...baseContext(), result: 'line 1\nline 2\nline 3' }
      )
      expect(result.passed).toBe(true)
    })

    it('should fail when row count does not match', async () => {
      const result = await runAssertion(
        { type: 'row_count', expected: 5 },
        { ...baseContext(), result: 'line 1\nline 2\nline 3' }
      )
      expect(result.passed).toBe(false)
      expect(result.actual).toBe(3)
    })

    it('should skip empty lines', async () => {
      const result = await runAssertion(
        { type: 'row_count', expected: 2 },
        { ...baseContext(), result: 'line 1\n\nline 2\n\n' }
      )
      expect(result.passed).toBe(true)
    })
  })

  describe('exit_code', () => {
    it('should pass when exit code matches', async () => {
      const result = await runAssertion(
        { type: 'exit_code', expected: 0 },
        { ...baseContext(), exitCode: 0 }
      )
      expect(result.passed).toBe(true)
    })

    it('should fail when exit code does not match', async () => {
      const result = await runAssertion(
        { type: 'exit_code', expected: 0 },
        { ...baseContext(), exitCode: 1 }
      )
      expect(result.passed).toBe(false)
    })
  })

  describe('runAssertions', () => {
    it('should run all assertions and aggregate results', async () => {
      await fs.writeFile(path.join(workspacePath, 'output.txt'), 'hello world')

      const result = await runAssertions(
        [
          { type: 'file_exists', target: 'output.txt' },
          { type: 'contains', expected: 'success' },
        ],
        { ...baseContext(), result: 'operation success' }
      )

      expect(result.passCount).toBe(2)
      expect(result.failCount).toBe(0)
      expect(result.passed).toBe(true)
    })

    it('should mark as failed if any assertion fails', async () => {
      const result = await runAssertions(
        [
          { type: 'contains', expected: 'yes' },
          { type: 'contains', expected: 'no' },
        ],
        { ...baseContext(), result: 'yes indeed' }
      )

      expect(result.passCount).toBe(1)
      expect(result.failCount).toBe(1)
      expect(result.passed).toBe(false)
    })
  })
})

describe('computeSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(computeSimilarity('hello world', 'hello world')).toBe(1)
  })

  it('should return 0 for empty strings', () => {
    expect(computeSimilarity('', 'hello')).toBe(0)
    expect(computeSimilarity('hello', '')).toBe(0)
  })

  it('should return partial similarity for overlapping words', () => {
    const sim = computeSimilarity('the quick brown fox', 'the quick brown dog')
    expect(sim).toBeGreaterThan(0.5)
    expect(sim).toBeLessThan(1)
  })

  it('should return 0 for completely different strings', () => {
    const sim = computeSimilarity('abc def', 'xyz uvw')
    expect(sim).toBe(0)
  })
})

describe('getNestedValue', () => {
  it('should get top-level value', () => {
    expect(getNestedValue({ name: 'Alice' }, 'name')).toBe('Alice')
  })

  it('should get nested value', () => {
    expect(getNestedValue({ data: { items: [1, 2] } }, 'data.items')).toEqual([1, 2])
  })

  it('should return undefined for missing path', () => {
    expect(getNestedValue({ data: {} }, 'data.missing')).toBeUndefined()
  })

  it('should return undefined for null', () => {
    expect(getNestedValue(null, 'anything')).toBeUndefined()
  })
})

describe('validateJsonSchema', () => {
  it('should validate type', () => {
    const errors = validateJsonSchema('hello', { type: 'string' })
    expect(errors).toHaveLength(0)
  })

  it('should reject wrong type', () => {
    const errors = validateJsonSchema('hello', { type: 'number' })
    expect(errors).toHaveLength(1)
  })

  it('should validate required fields', () => {
    const errors = validateJsonSchema(
      { name: 'Alice' },
      { type: 'object', required: ['name', 'age'], properties: { name: { type: 'string' }, age: { type: 'number' } } }
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('age')
  })

  it('should validate nested objects', () => {
    const errors = validateJsonSchema(
      { data: { count: 'not a number' } },
      { type: 'object', properties: { data: { type: 'object', properties: { count: { type: 'number' } } } } }
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('count')
  })

  it('should validate array items', () => {
    const errors = validateJsonSchema(
      [1, 'two', 3],
      { type: 'array', items: { type: 'number' } }
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('[1]')
  })
})
