/**
 * Semantic Grader Service — full port of skill-creator's grader agent.
 *
 * Evidence-based verdicts with quoted text, claim extraction and verification,
 * eval critique with specific suggestions. No partial credit.
 *
 * Uses the Anthropic SDK directly (same pattern as judge assertions).
 */

import Anthropic from '@anthropic-ai/sdk'

// ── Types ──

export interface SemanticAssertion {
  type: 'semantic'
  description: string       // What to check, in natural language
  criterion: string          // Specific evaluation criterion with clear pass/fail boundary
  dimension: 'structure' | 'content' | 'quality' | 'format'
  discriminating_note?: string  // Why this assertion matters / what a false positive looks like
}

export interface SemanticGradeResult {
  passed: boolean
  evidence: string         // Quoted text from output supporting verdict
  confidence: number       // 0-1
  reasoning: string        // Why pass/fail, with specific citations
  claims: ClaimVerification[]  // Implicit claims extracted and verified
  evalFeedback?: EvalFeedback  // Critique of the assertion itself
}

export interface ClaimVerification {
  claim: string
  type: 'factual' | 'process' | 'quality'
  verified: boolean
  evidence: string
}

export interface EvalFeedback {
  suggestions: Array<{
    assertion?: string
    reason: string
  }>
  overall: string
}

// ── Grader Service ──

/**
 * Grade a single semantic assertion against an output using LLM-as-judge.
 * Follows skill-creator's grader.md 8-step process exactly.
 */
export async function gradeSemanticAssertion(
  assertion: SemanticAssertion,
  output: string,
  prompt: string
): Promise<SemanticGradeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      passed: false,
      evidence: 'No API key available for semantic grading',
      confidence: 0,
      reasoning: 'Cannot perform semantic grading without an API key.',
      claims: [],
    }
  }

  const client = new Anthropic({ apiKey })

  const systemPrompt = buildGraderSystemPrompt()
  const userPrompt = buildGraderUserPrompt(assertion, output, prompt)

  try {
    // Use a cheaper model for grading (sonnet) but fall back to config default
    const graderModel = process.env.SEMANTIC_GRADER_MODEL || 'claude-sonnet-4-20250514'
    const response = await client.messages.create({
      model: graderModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseGraderResponse(text, assertion)
  } catch (err) {
    return {
      passed: false,
      evidence: `Grader error: ${err instanceof Error ? err.message : String(err)}`,
      confidence: 0,
      reasoning: 'Semantic grading failed due to an API error.',
      claims: [],
    }
  }
}

/**
 * Grade all semantic assertions for a case and return combined results.
 */
export async function gradeAllSemanticAssertions(
  assertions: SemanticAssertion[],
  output: string,
  prompt: string
): Promise<{
  results: SemanticGradeResult[]
  allClaims: ClaimVerification[]
  combinedFeedback: EvalFeedback | undefined
}> {
  const results: SemanticGradeResult[] = []
  const allClaims: ClaimVerification[] = []
  const allSuggestions: EvalFeedback['suggestions'] = []

  for (const assertion of assertions) {
    const result = await gradeSemanticAssertion(assertion, output, prompt)
    results.push(result)

    if (result.claims.length > 0) {
      allClaims.push(...result.claims)
    }
    if (result.evalFeedback) {
      allSuggestions.push(...result.evalFeedback.suggestions)
    }
  }

  const combinedFeedback: EvalFeedback | undefined = allSuggestions.length > 0
    ? {
        suggestions: allSuggestions,
        overall: allSuggestions.length > 0
          ? `${allSuggestions.length} suggestion(s) for improving eval assertions.`
          : 'No suggestions, evals look solid.',
      }
    : undefined

  return { results, allClaims, combinedFeedback }
}

// ── Programmatic Assertion Detection ──

/**
 * Detect if a semantic assertion can be satisfied by a deterministic programmatic check
 * instead of an LLM call. Returns null if no programmatic equivalent is found.
 *
 * Detectable patterns:
 * - JSON validity: "output should be valid JSON", "returns valid JSON"
 * - String contains: "output should contain X", "mentions X"
 * - Regex match: "output matches pattern X"
 * - File existence: "file X should exist", "creates file X"
 */
export function detectProgrammaticAssertion(
  assertion: SemanticAssertion,
): { type: 'json_valid' | 'contains' | 'regex' | 'file_exists'; target?: string; expected?: string; script?: string } | null {
  const descLower = assertion.description.toLowerCase()
  const criterionLower = assertion.criterion.toLowerCase()

  // JSON validity detection
  if (
    /\bvalid json\b/i.test(descLower) || /\bvalid json\b/i.test(criterionLower) ||
    /\breturns?\s+json\b/i.test(descLower) || /\bparseable?\s+json\b/i.test(descLower)
  ) {
    return {
      type: 'json_valid',
      script: `try { JSON.parse(process.env.EVAL_RESULT); console.log(JSON.stringify({ passed: true, evidence: "Output is valid JSON" })) } catch(e) { console.log(JSON.stringify({ passed: false, evidence: "Output is not valid JSON: " + e.message })) }`,
    }
  }

  // String contains detection — "should contain X", "must include X", "mentions X"
  // Use original strings for extraction to preserve case in captured values
  const containsMatch = assertion.description.match(/(?:should |must |needs to )?(?:contain|include|mention|have)\s+["']([^"']+)["']/i)
    || assertion.criterion.match(/(?:should |must |needs to )?(?:contain|include|mention|have)\s+["']([^"']+)["']/i)
  if (containsMatch) {
    const needle = containsMatch[1]
    return {
      type: 'contains',
      expected: needle,
      script: `const r = process.env.EVAL_RESULT || ''; const n = ${JSON.stringify(needle)}; const found = r.toLowerCase().includes(n.toLowerCase()); console.log(JSON.stringify({ passed: found, evidence: found ? 'Output contains "' + n + '"' : 'Output does not contain "' + n + '"' }))`,
    }
  }

  // Regex match detection — "matches pattern /X/", "matches regex X"
  // Use original strings to preserve case in regex patterns
  const regexMatch = assertion.description.match(/match(?:es)?\s+(?:pattern|regex)\s+\/([^/]+)\//i)
    || assertion.criterion.match(/match(?:es)?\s+(?:pattern|regex)\s+\/([^/]+)\//i)
  if (regexMatch) {
    const pattern = regexMatch[1]
    return {
      type: 'regex',
      expected: pattern,
      script: `const r = process.env.EVAL_RESULT || ''; try { const re = new RegExp(${JSON.stringify(pattern)}); console.log(JSON.stringify({ passed: re.test(r), evidence: re.test(r) ? 'Output matches pattern' : 'Output does not match pattern' })) } catch(e) { console.log(JSON.stringify({ passed: false, evidence: 'Invalid regex: ' + e.message })) }`,
    }
  }

  // File existence detection — "file X should exist", "creates file X"
  // Use original strings to preserve case in file paths (important on case-sensitive filesystems)
  const fileMatch = assertion.description.match(/(?:file|creates?)\s+["']?([^\s"']+)["']?\s+(?:should |must )?exist/i)
    || assertion.criterion.match(/(?:file|creates?)\s+["']?([^\s"']+)["']?\s+(?:should |must )?exist/i)
  if (fileMatch) {
    const filePath = fileMatch[1]
    return {
      type: 'file_exists',
      target: filePath,
      script: `const fs = require('fs'); const path = require('path'); const ws = process.env.EVAL_WORKSPACE || '.'; const fp = path.resolve(ws, ${JSON.stringify(filePath)}); if (!fp.startsWith(path.resolve(ws) + path.sep) && fp !== path.resolve(ws)) { console.log(JSON.stringify({ passed: false, evidence: 'Path traversal detected' })) } else { const exists = fs.existsSync(fp); console.log(JSON.stringify({ passed: exists, evidence: exists ? 'File exists: ' + fp : 'File not found: ' + fp })) }`,
    }
  }

  return null
}

// ── Prompt Builders ──

function buildGraderSystemPrompt(): string {
  return `You are a rigorous eval grader. Your job is to determine whether a specific criterion is met by examining the output evidence.

You have two jobs:
1. Grade the output against the criterion — provide clear evidence for your judgment.
2. Critique the eval assertion itself — if it's trivially satisfied or misses important outcomes, say so.

## Grading Criteria

**PASS when**:
- The output clearly demonstrates the criterion is met
- Specific evidence can be cited (quote the exact text)
- The evidence reflects genuine substance, not just surface compliance

**FAIL when**:
- No evidence found for the criterion
- Evidence contradicts the criterion
- The criterion cannot be verified from available output
- Evidence is superficial — technically satisfied but the underlying quality is wrong
- The output appears to meet the criterion by coincidence rather than genuine quality

**When uncertain**: The burden of proof to pass is on the criterion. Default to FAIL.

## Guidelines
- Be objective: Base verdicts on evidence, not assumptions
- Be specific: Quote the exact text that supports your verdict
- Be thorough: Examine the entire output
- No partial credit: Each criterion is pass or fail
- Extract implicit claims from the output and verify them

## Output Format
Respond with a JSON object:
{
  "passed": boolean,
  "evidence": "Quoted text from the output supporting the verdict",
  "confidence": 0.0-1.0,
  "reasoning": "Why pass/fail, with specific citations",
  "claims": [
    {
      "claim": "An implicit claim from the output",
      "type": "factual" | "process" | "quality",
      "verified": boolean,
      "evidence": "Evidence supporting or contradicting the claim"
    }
  ],
  "eval_feedback": {
    "suggestions": [
      {
        "assertion": "The criterion being evaluated (optional)",
        "reason": "Why this assertion could be improved"
      }
    ],
    "overall": "Brief assessment of eval quality"
  }
}

Respond ONLY with valid JSON.`
}

function buildGraderUserPrompt(
  assertion: SemanticAssertion,
  output: string,
  prompt: string
): string {
  let userPrompt = `## Original Prompt
${prompt}

## Output to Grade
${output.slice(0, 20000)}

## Criterion to Evaluate
**Description:** ${assertion.description}
**Pass/Fail Boundary:** ${assertion.criterion}
**Dimension:** ${assertion.dimension}`

  if (assertion.discriminating_note) {
    userPrompt += `\n**Discriminating Note:** ${assertion.discriminating_note}`
  }

  userPrompt += `

## Your Task
1. Read the output completely — note structure, content, quality
2. Search for evidence matching the criterion
3. Determine PASS or FAIL based on the evidence
4. Extract implicit claims from the output and verify them
5. Critique this eval assertion — would a clearly wrong output also pass? Is there an important outcome this assertion misses?
6. Return your grading as JSON`

  return userPrompt
}

// ── Response Parser ──

function parseGraderResponse(text: string, assertion: SemanticAssertion): SemanticGradeResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      passed: false,
      evidence: 'Failed to parse grader response',
      confidence: 0,
      reasoning: `Grader response was not valid JSON: ${text.slice(0, 200)}`,
      claims: [],
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      passed?: boolean
      evidence?: string
      confidence?: number
      reasoning?: string
      claims?: Array<{
        claim?: string
        type?: string
        verified?: boolean
        evidence?: string
      }>
      eval_feedback?: {
        suggestions?: Array<{
          assertion?: string
          reason?: string
        }>
        overall?: string
      }
    }

    const claims: ClaimVerification[] = (parsed.claims || [])
      .filter(c => c.claim && c.type)
      .map(c => ({
        claim: c.claim!,
        type: (c.type as 'factual' | 'process' | 'quality') || 'quality',
        verified: c.verified ?? false,
        evidence: c.evidence || 'No evidence provided',
      }))

    const evalFeedback: EvalFeedback | undefined = parsed.eval_feedback
      ? {
          suggestions: (parsed.eval_feedback.suggestions || [])
            .filter(s => s.reason)
            .map(s => ({
              assertion: s.assertion || assertion.description,
              reason: s.reason!,
            })),
          overall: parsed.eval_feedback.overall || 'No overall assessment provided.',
        }
      : undefined

    return {
      passed: parsed.passed ?? false,
      evidence: parsed.evidence || 'No evidence provided',
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      reasoning: parsed.reasoning || 'No reasoning provided',
      claims,
      evalFeedback: evalFeedback && evalFeedback.suggestions.length > 0 ? evalFeedback : undefined,
    }
  } catch {
    return {
      passed: false,
      evidence: 'Failed to parse grader JSON',
      confidence: 0,
      reasoning: `JSON parse error in grader response: ${text.slice(0, 200)}`,
      claims: [],
    }
  }
}
