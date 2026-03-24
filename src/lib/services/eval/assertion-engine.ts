/**
 * Assertion engine for evaluating Claude Code execution outputs.
 * Supports code assertions, LLM-judged assertions, and custom script validators.
 *
 * Assertion types from PRD 8.5:
 * - file_exists: check if a file was created
 * - file_content: check file content with exact or fuzzy match
 * - json_valid: validate JSON output
 * - json_schema: validate against a JSON schema
 * - contains: output contains substring
 * - not_contains: output does not contain substring
 * - regex: output matches regex pattern
 * - row_count: check number of rows/lines
 * - exit_code: check process exit code
 * - custom_script: run a custom validator script
 */

import fs from 'fs/promises'
import path from 'path'

export type AssertionType =
  | 'file_exists'
  | 'file_content'
  | 'json_valid'
  | 'json_schema'
  | 'contains'
  | 'not_contains'
  | 'regex'
  | 'row_count'
  | 'exit_code'
  | 'custom_script'
  | 'judge'
  | 'semantic'
  | 'programmatic'

export interface AssertionDefinition {
  type: AssertionType
  target?: string // file path, field name, etc.
  expected?: string | number | boolean | Record<string, unknown>
  options?: {
    caseSensitive?: boolean
    fuzzyThreshold?: number // 0-1, for fuzzy matching
    schema?: Record<string, unknown> // JSON schema
    scriptPath?: string // path to custom validator script
    script?: string // inline script for programmatic assertions
    field?: string // JSON field path for nested checks
    judgeId?: string // judge ID for 'judge' assertion type
    expectedOutcome?: string // expected outcome for judge context
    prompt?: string // original prompt for judge context
    description?: string // semantic assertion description
    criterion?: string // semantic assertion pass/fail criterion
    dimension?: string // semantic assertion dimension
    discriminating_note?: string // semantic assertion discriminating note
  }
}

export interface AssertionResult {
  type: AssertionType
  passed: boolean
  target?: string
  expected?: unknown
  actual?: unknown
  evidence: string
  durationMs: number
  // Semantic grading structured data (only populated for type === 'semantic')
  semanticEvidence?: string
  semanticReasoning?: string
  semanticConfidence?: number
  semanticDimension?: string
  semanticClaimsJson?: string
  semanticEvalFeedbackJson?: string
}

/**
 * Run a single assertion against execution outputs.
 */
export async function runAssertion(
  assertion: AssertionDefinition,
  context: {
    workspacePath: string
    stdout: string
    stderr: string
    exitCode?: number
    result: string
  }
): Promise<AssertionResult> {
  const start = Date.now()

  try {
    switch (assertion.type) {
      case 'file_exists':
        return await assertFileExists(assertion, context, start)
      case 'file_content':
        return await assertFileContent(assertion, context, start)
      case 'json_valid':
        return await assertJsonValid(assertion, context, start)
      case 'json_schema':
        return await assertJsonSchema(assertion, context, start)
      case 'contains':
        return await assertContains(assertion, context, start)
      case 'not_contains':
        return await assertNotContains(assertion, context, start)
      case 'regex':
        return await assertRegex(assertion, context, start)
      case 'row_count':
        return await assertRowCount(assertion, context, start)
      case 'exit_code':
        return await assertExitCode(assertion, context, start)
      case 'custom_script':
        return await assertCustomScript(assertion, context, start)
      case 'judge':
        return await assertJudge(assertion, context, start)
      case 'semantic':
        return await assertSemantic(assertion, context, start)
      case 'programmatic':
        return await assertProgrammatic(assertion, context, start)
      default:
        return {
          type: assertion.type,
          passed: false,
          evidence: `Unknown assertion type: ${assertion.type}`,
          durationMs: Date.now() - start,
        }
    }
  } catch (err) {
    return {
      type: assertion.type,
      passed: false,
      target: assertion.target,
      expected: assertion.expected,
      evidence: `Assertion error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    }
  }
}

/**
 * Run all assertions for an eval case and return results.
 */
export async function runAssertions(
  assertions: AssertionDefinition[],
  context: {
    workspacePath: string
    stdout: string
    stderr: string
    exitCode?: number
    result: string
  }
): Promise<{
  results: AssertionResult[]
  passed: boolean
  passCount: number
  failCount: number
  totalDurationMs: number
}> {
  const results: AssertionResult[] = []
  const start = Date.now()

  for (const assertion of assertions) {
    const result = await runAssertion(assertion, context)
    results.push(result)
  }

  const passCount = results.filter(r => r.passed).length
  const failCount = results.filter(r => !r.passed).length

  return {
    results,
    passed: failCount === 0,
    passCount,
    failCount,
    totalDurationMs: Date.now() - start,
  }
}

// --- Assertion implementations ---

async function assertFileExists(
  assertion: AssertionDefinition,
  context: { workspacePath: string },
  start: number
): Promise<AssertionResult> {
  const target = assertion.target
  if (!target) {
    return {
      type: 'file_exists',
      passed: false,
      evidence: 'No target file path specified',
      durationMs: Date.now() - start,
    }
  }

  const filePath = path.resolve(context.workspacePath, target)
  // Security: ensure path is within workspace
  if (!filePath.startsWith(context.workspacePath + path.sep)) {
    return {
      type: 'file_exists',
      passed: false,
      target,
      evidence: 'Path traversal detected',
      durationMs: Date.now() - start,
    }
  }

  try {
    await fs.access(filePath)
    return {
      type: 'file_exists',
      passed: true,
      target,
      evidence: `File exists: ${target}`,
      durationMs: Date.now() - start,
    }
  } catch {
    return {
      type: 'file_exists',
      passed: false,
      target,
      expected: 'file exists',
      actual: 'file not found',
      evidence: `File not found: ${target}`,
      durationMs: Date.now() - start,
    }
  }
}

async function assertFileContent(
  assertion: AssertionDefinition,
  context: { workspacePath: string },
  start: number
): Promise<AssertionResult> {
  const target = assertion.target
  if (!target) {
    return {
      type: 'file_content',
      passed: false,
      evidence: 'No target file path specified',
      durationMs: Date.now() - start,
    }
  }

  const filePath = path.resolve(context.workspacePath, target)
  if (!filePath.startsWith(context.workspacePath + path.sep)) {
    return {
      type: 'file_content',
      passed: false,
      target,
      evidence: 'Path traversal detected',
      durationMs: Date.now() - start,
    }
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const expected = String(assertion.expected ?? '')
    const caseSensitive = assertion.options?.caseSensitive !== false

    let passed: boolean
    if (assertion.options?.fuzzyThreshold != null) {
      // Fuzzy match: check similarity ratio
      const similarity = computeSimilarity(
        caseSensitive ? content : content.toLowerCase(),
        caseSensitive ? expected : expected.toLowerCase()
      )
      passed = similarity >= assertion.options.fuzzyThreshold
    } else {
      // Exact or case-insensitive match
      passed = caseSensitive
        ? content.includes(expected)
        : content.toLowerCase().includes(expected.toLowerCase())
    }

    return {
      type: 'file_content',
      passed,
      target,
      expected: expected.slice(0, 200),
      actual: content.slice(0, 200),
      evidence: passed
        ? `File ${target} contains expected content`
        : `File ${target} does not contain expected content`,
      durationMs: Date.now() - start,
    }
  } catch {
    return {
      type: 'file_content',
      passed: false,
      target,
      evidence: `Cannot read file: ${target}`,
      durationMs: Date.now() - start,
    }
  }
}

async function assertJsonValid(
  assertion: AssertionDefinition,
  context: { result: string; workspacePath: string },
  start: number
): Promise<AssertionResult> {
  let content: string

  if (assertion.target) {
    const filePath = path.resolve(context.workspacePath, assertion.target)
    if (!filePath.startsWith(context.workspacePath + path.sep)) {
      return {
        type: 'json_valid',
        passed: false,
        target: assertion.target,
        evidence: 'Path traversal detected',
        durationMs: Date.now() - start,
      }
    }
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      return {
        type: 'json_valid',
        passed: false,
        target: assertion.target,
        evidence: `Cannot read file: ${assertion.target}`,
        durationMs: Date.now() - start,
      }
    }
  } else {
    content = context.result
  }

  try {
    const parsed = JSON.parse(content)

    // If a specific field is requested, check that field
    if (assertion.options?.field) {
      const value = getNestedValue(parsed, assertion.options.field)
      if (value === undefined) {
        return {
          type: 'json_valid',
          passed: false,
          target: assertion.target,
          evidence: `JSON field '${assertion.options.field}' not found`,
          durationMs: Date.now() - start,
        }
      }
    }

    return {
      type: 'json_valid',
      passed: true,
      target: assertion.target,
      evidence: 'Valid JSON',
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      type: 'json_valid',
      passed: false,
      target: assertion.target,
      evidence: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    }
  }
}

async function assertJsonSchema(
  assertion: AssertionDefinition,
  context: { result: string; workspacePath: string },
  start: number
): Promise<AssertionResult> {
  let content: string

  if (assertion.target) {
    const filePath = path.resolve(context.workspacePath, assertion.target)
    if (!filePath.startsWith(context.workspacePath + path.sep)) {
      return {
        type: 'json_schema',
        passed: false,
        target: assertion.target,
        evidence: 'Path traversal detected',
        durationMs: Date.now() - start,
      }
    }
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      return {
        type: 'json_schema',
        passed: false,
        target: assertion.target,
        evidence: `Cannot read file: ${assertion.target}`,
        durationMs: Date.now() - start,
      }
    }
  } else {
    content = context.result
  }

  const schema = assertion.options?.schema ?? (assertion.expected as Record<string, unknown>)
  if (!schema) {
    return {
      type: 'json_schema',
      passed: false,
      evidence: 'No schema specified',
      durationMs: Date.now() - start,
    }
  }

  try {
    const parsed = JSON.parse(content)
    const errors = validateJsonSchema(parsed, schema)

    return {
      type: 'json_schema',
      passed: errors.length === 0,
      target: assertion.target,
      expected: schema,
      evidence: errors.length === 0
        ? 'JSON matches schema'
        : `Schema validation errors: ${errors.join('; ')}`,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      type: 'json_schema',
      passed: false,
      target: assertion.target,
      evidence: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    }
  }
}

async function assertContains(
  assertion: AssertionDefinition,
  context: { result: string; stdout: string },
  start: number
): Promise<AssertionResult> {
  const expected = String(assertion.expected ?? '')
  const searchIn = assertion.target === 'stdout' ? context.stdout : context.result
  const caseSensitive = assertion.options?.caseSensitive !== false

  const passed = caseSensitive
    ? searchIn.includes(expected)
    : searchIn.toLowerCase().includes(expected.toLowerCase())

  return {
    type: 'contains',
    passed,
    target: assertion.target ?? 'result',
    expected,
    actual: searchIn.slice(0, 200),
    evidence: passed
      ? `Output contains: "${expected.slice(0, 100)}"`
      : `Output does not contain: "${expected.slice(0, 100)}"`,
    durationMs: Date.now() - start,
  }
}

async function assertNotContains(
  assertion: AssertionDefinition,
  context: { result: string; stdout: string },
  start: number
): Promise<AssertionResult> {
  const expected = String(assertion.expected ?? '')
  const searchIn = assertion.target === 'stdout' ? context.stdout : context.result
  const caseSensitive = assertion.options?.caseSensitive !== false

  const contains = caseSensitive
    ? searchIn.includes(expected)
    : searchIn.toLowerCase().includes(expected.toLowerCase())

  return {
    type: 'not_contains',
    passed: !contains,
    target: assertion.target ?? 'result',
    expected: `not: ${expected}`,
    evidence: !contains
      ? `Output correctly does not contain: "${expected.slice(0, 100)}"`
      : `Output incorrectly contains: "${expected.slice(0, 100)}"`,
    durationMs: Date.now() - start,
  }
}

async function assertRegex(
  assertion: AssertionDefinition,
  context: { result: string; stdout: string },
  start: number
): Promise<AssertionResult> {
  const pattern = String(assertion.expected ?? '')
  const searchIn = assertion.target === 'stdout' ? context.stdout : context.result

  try {
    const flags = assertion.options?.caseSensitive === false ? 'i' : ''
    const regex = new RegExp(pattern, flags)
    const passed = regex.test(searchIn)

    return {
      type: 'regex',
      passed,
      target: assertion.target ?? 'result',
      expected: pattern,
      evidence: passed
        ? `Output matches pattern: /${pattern}/`
        : `Output does not match pattern: /${pattern}/`,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      type: 'regex',
      passed: false,
      expected: pattern,
      evidence: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    }
  }
}

async function assertRowCount(
  assertion: AssertionDefinition,
  context: { result: string; workspacePath: string },
  start: number
): Promise<AssertionResult> {
  let content: string

  if (assertion.target) {
    const filePath = path.resolve(context.workspacePath, assertion.target)
    if (!filePath.startsWith(context.workspacePath + path.sep)) {
      return {
        type: 'row_count',
        passed: false,
        target: assertion.target,
        evidence: 'Path traversal detected',
        durationMs: Date.now() - start,
      }
    }
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      return {
        type: 'row_count',
        passed: false,
        target: assertion.target,
        evidence: `Cannot read file: ${assertion.target}`,
        durationMs: Date.now() - start,
      }
    }
  } else {
    content = context.result
  }

  const lineCount = content.split('\n').filter(l => l.trim().length > 0).length
  const expected = Number(assertion.expected)

  if (isNaN(expected)) {
    return {
      type: 'row_count',
      passed: false,
      evidence: 'Expected row count is not a number',
      durationMs: Date.now() - start,
    }
  }

  const passed = lineCount === expected

  return {
    type: 'row_count',
    passed,
    target: assertion.target,
    expected,
    actual: lineCount,
    evidence: passed
      ? `Row count matches: ${lineCount}`
      : `Row count mismatch: expected ${expected}, got ${lineCount}`,
    durationMs: Date.now() - start,
  }
}

async function assertExitCode(
  assertion: AssertionDefinition,
  context: { exitCode?: number },
  start: number
): Promise<AssertionResult> {
  const expected = Number(assertion.expected ?? 0)
  const actual = context.exitCode ?? 0
  const passed = actual === expected

  return {
    type: 'exit_code',
    passed,
    expected,
    actual,
    evidence: passed
      ? `Exit code matches: ${actual}`
      : `Exit code mismatch: expected ${expected}, got ${actual}`,
    durationMs: Date.now() - start,
  }
}

async function assertCustomScript(
  assertion: AssertionDefinition,
  context: { workspacePath: string; result: string; stdout: string; stderr: string },
  start: number
): Promise<AssertionResult> {
  const scriptPath = assertion.options?.scriptPath ?? assertion.target
  if (!scriptPath) {
    return {
      type: 'custom_script',
      passed: false,
      evidence: 'No script path specified',
      durationMs: Date.now() - start,
    }
  }

  const fullPath = path.resolve(context.workspacePath, scriptPath)
  if (!fullPath.startsWith(context.workspacePath + path.sep)) {
    return {
      type: 'custom_script',
      passed: false,
      target: scriptPath,
      evidence: 'Path traversal detected',
      durationMs: Date.now() - start,
    }
  }

  try {
    await fs.access(fullPath)
  } catch {
    return {
      type: 'custom_script',
      passed: false,
      target: scriptPath,
      evidence: `Script not found: ${scriptPath}`,
      durationMs: Date.now() - start,
    }
  }

  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)

    const { stdout: scriptOutput } = await execFileAsync(
      'node',
      [fullPath],
      {
        cwd: context.workspacePath,
        timeout: 30000,
        env: {
          ...process.env,
          EVAL_RESULT: context.result,
          EVAL_STDOUT: context.stdout,
          EVAL_STDERR: context.stderr,
          EVAL_WORKSPACE: context.workspacePath,
        },
      }
    )

    // Script should output JSON: { passed: boolean, evidence: string }
    const scriptResult = JSON.parse(scriptOutput.trim()) as {
      passed: boolean
      evidence?: string
    }

    return {
      type: 'custom_script',
      passed: scriptResult.passed,
      target: scriptPath,
      evidence: scriptResult.evidence ?? (scriptResult.passed ? 'Custom validation passed' : 'Custom validation failed'),
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      type: 'custom_script',
      passed: false,
      target: scriptPath,
      evidence: `Script execution error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    }
  }
}

async function assertJudge(
  assertion: AssertionDefinition,
  context: { result: string; stdout: string },
  start: number
): Promise<AssertionResult> {
  const judgeId = assertion.options?.judgeId
  if (!judgeId) {
    return {
      type: 'judge',
      passed: false,
      evidence: 'No judgeId specified in assertion options',
      durationMs: Date.now() - start,
    }
  }

  try {
    const { evaluateWithJudge } = await import('../judge/judge-evaluator')
    const result = await evaluateWithJudge({
      judgeId,
      input: assertion.options?.prompt || '',
      output: context.result,
      expectedOutcome: assertion.options?.expectedOutcome || String(assertion.expected ?? ''),
    })

    return {
      type: 'judge',
      passed: result.passed,
      expected: 'pass',
      actual: result.label,
      evidence: `Judge verdict: ${result.label} (confidence: ${(result.confidence * 100).toFixed(0)}%) — ${result.evidence}${result.chainOfThought ? `\n\nReasoning: ${result.chainOfThought}` : ''}`,
      durationMs: result.durationMs,
    }
  } catch (err) {
    return {
      type: 'judge',
      passed: false,
      evidence: `Judge evaluation error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    }
  }
}

async function assertSemantic(
  assertion: AssertionDefinition,
  context: { result: string; stdout: string },
  start: number
): Promise<AssertionResult> {
  const description = assertion.options?.description as string || String(assertion.expected ?? '')
  const criterion = assertion.options?.criterion as string || description
  const dimension = (assertion.options?.dimension as string || 'quality') as 'structure' | 'content' | 'quality' | 'format'
  const discriminatingNote = assertion.options?.discriminating_note as string | undefined
  const prompt = assertion.options?.prompt as string || ''

  try {
    const { gradeSemanticAssertion } = await import('./semantic-grader')
    const result = await gradeSemanticAssertion(
      { type: 'semantic', description, criterion, dimension, discriminating_note: discriminatingNote },
      context.result,
      prompt
    )

    return {
      type: 'semantic',
      passed: result.passed,
      expected: criterion,
      actual: result.evidence.slice(0, 500),
      evidence: `[${dimension.toUpperCase()}] ${result.passed ? 'PASS' : 'FAIL'} (confidence: ${(result.confidence * 100).toFixed(0)}%)\n\nEvidence: ${result.evidence}\n\nReasoning: ${result.reasoning}${result.claims.length > 0 ? `\n\nClaims verified: ${result.claims.filter(c => c.verified).length}/${result.claims.length}` : ''}${result.evalFeedback ? `\n\nEval feedback: ${result.evalFeedback.overall}` : ''}`,
      durationMs: Date.now() - start,
      // Structured semantic data for persistence
      semanticEvidence: result.evidence,
      semanticReasoning: result.reasoning,
      semanticConfidence: result.confidence,
      semanticDimension: dimension,
      semanticClaimsJson: JSON.stringify(result.claims),
      semanticEvalFeedbackJson: result.evalFeedback ? JSON.stringify(result.evalFeedback) : '{}',
    }
  } catch (err) {
    return {
      type: 'semantic',
      passed: false,
      expected: criterion,
      evidence: `Semantic grading error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    }
  }
}

/**
 * Execute a programmatic assertion — runs a deterministic check (JSON validity,
 * regex match, string contains, file existence) without needing an LLM call.
 */
async function assertProgrammatic(
  assertion: AssertionDefinition,
  context: { workspacePath: string; result: string; stdout: string; stderr: string },
  start: number
): Promise<AssertionResult> {
  const script = assertion.options?.script ?? ''
  if (!script) {
    return {
      type: 'programmatic',
      passed: false,
      evidence: 'No script provided for programmatic assertion',
      durationMs: Date.now() - start,
    }
  }

  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)

    // Execute the script as a Node.js inline script
    const { stdout: scriptOutput } = await execFileAsync(
      'node',
      ['-e', script],
      {
        cwd: context.workspacePath,
        timeout: 10000,
        env: {
          ...process.env,
          EVAL_RESULT: context.result,
          EVAL_STDOUT: context.stdout,
          EVAL_STDERR: context.stderr,
          EVAL_WORKSPACE: context.workspacePath,
        },
      }
    )

    // Script should output JSON: { passed: boolean, evidence: string }
    const result = JSON.parse(scriptOutput.trim()) as {
      passed: boolean
      evidence?: string
    }

    return {
      type: 'programmatic',
      passed: result.passed,
      expected: assertion.expected != null ? String(assertion.expected) : undefined,
      evidence: result.evidence ?? (result.passed ? 'Programmatic check passed' : 'Programmatic check failed'),
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      type: 'programmatic',
      passed: false,
      evidence: `Programmatic assertion error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    }
  }
}

// --- Utility functions ---

/**
 * Simple Jaccard-like similarity between two strings.
 */
export function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0

  const wordsA = new Set(a.split(/\s+/))
  const wordsB = new Set(b.split(/\s+/))

  let intersection = 0
  for (const w of Array.from(wordsA)) {
    if (wordsB.has(w)) intersection++
  }

  const union = wordsA.size + wordsB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Get a nested value from an object using dot notation.
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Lightweight JSON schema validator (supports type, required, properties).
 */
export function validateJsonSchema(
  data: unknown,
  schema: Record<string, unknown>,
  prefix = ''
): string[] {
  const errors: string[] = []

  // Type check
  if (schema.type) {
    const expectedType = schema.type as string
    const actualType = Array.isArray(data) ? 'array' : typeof data

    if (expectedType === 'array' && !Array.isArray(data)) {
      errors.push(`${prefix || 'root'}: expected array, got ${actualType}`)
      return errors
    }
    if (expectedType !== 'array' && actualType !== expectedType) {
      errors.push(`${prefix || 'root'}: expected ${expectedType}, got ${actualType}`)
      return errors
    }
  }

  // Object property checks
  if (schema.properties && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const dataObj = data as Record<string, unknown>
    const props = schema.properties as Record<string, Record<string, unknown>>

    // Required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const req of schema.required as string[]) {
        if (!(req in dataObj)) {
          errors.push(`${prefix ? prefix + '.' : ''}${req}: required field missing`)
        }
      }
    }

    // Validate each property
    for (const [key, propSchema] of Object.entries(props)) {
      if (key in dataObj) {
        const subErrors = validateJsonSchema(
          dataObj[key],
          propSchema,
          prefix ? `${prefix}.${key}` : key
        )
        errors.push(...subErrors)
      }
    }
  }

  // Array item checks
  if (schema.items && Array.isArray(data)) {
    const itemSchema = schema.items as Record<string, unknown>
    for (let i = 0; i < data.length; i++) {
      const subErrors = validateJsonSchema(
        data[i],
        itemSchema,
        `${prefix || 'root'}[${i}]`
      )
      errors.push(...subErrors)
    }
  }

  return errors
}
