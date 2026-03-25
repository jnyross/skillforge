/**
 * Analyzer Service — Post-hoc Analysis Agent.
 * Full port of skill-creator's analyzer.md (8-step process).
 *
 * After blind comparison determines a winner, the analyzer examines
 * skills and transcripts to understand WHY the winner won and generate
 * actionable improvement suggestions.
 *
 * 8-step process:
 * 1. Read comparison result
 * 2. Read both skills
 * 3. Read both transcripts
 * 4. Analyze instruction following
 * 5. Identify winner strengths
 * 6. Identify loser weaknesses
 * 7. Generate improvement suggestions (prioritized + categorized)
 * 8. Write analysis results with quoted evidence
 */

import Anthropic from '@anthropic-ai/sdk'

// --- Types ---

export type SuggestionCategory =
  | 'instructions'
  | 'tools'
  | 'examples'
  | 'error_handling'
  | 'structure'
  | 'references'

export type SuggestionPriority = 'high' | 'medium' | 'low'

export interface ImprovementSuggestion {
  priority: SuggestionPriority
  category: SuggestionCategory
  suggestion: string
  expected_impact: string
  /** Quoted evidence from skill or transcript */
  evidence?: string
}

export interface InstructionFollowing {
  score: number
  issues: string[]
}

export interface AnalysisResult {
  comparison_summary: {
    winner: 'skill' | 'baseline' | 'TIE'
    comparator_reasoning: string
    skill_score: number
    baseline_score: number
    delta: number
  }
  winner_strengths: string[]
  loser_weaknesses: string[]
  instruction_following: {
    skill: InstructionFollowing
    baseline: InstructionFollowing
  }
  improvement_suggestions: ImprovementSuggestion[]
  transcript_insights: {
    skill_execution_pattern: string
    baseline_execution_pattern: string
  }
}

export interface AnalyzerInput {
  /** The blind comparator's output */
  comparisonResult: {
    winner: 'skill' | 'baseline' | 'TIE'
    reasoning: string
    skillScore: number
    baselineScore: number
    delta: number
  }
  /** The skill's SKILL.md content */
  skillContent: string
  /** The skill output (transcript) */
  skillOutput: string
  /** The baseline output (transcript) */
  baselineOutput: string
  /** The eval prompt that was used */
  evalPrompt: string
  /** Human feedback from output viewer, surfaced as context for suggestions */
  humanFeedback?: string[]
  /** Additional case comparison results for multi-case analysis */
  additionalCases?: Array<{
    evalPrompt: string
    skillOutput: string
    baselineOutput: string
    comparison: { winner: string; delta: number }
  }>
}

// --- Main ---

/**
 * Run the 8-step post-hoc analysis to generate improvement suggestions.
 * Uses Anthropic SDK (not Claude CLI) per roadmap spec.
 */
export async function analyzeComparison(input: AnalyzerInput): Promise<AnalysisResult> {
  const client = new Anthropic()
  const model = process.env.ANALYZER_MODEL || 'claude-opus-4-6'

  const prompt = buildAnalyzerPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  return parseAnalyzerResponse(text, input)
}

// --- Prompt Construction ---

function buildAnalyzerPrompt(input: AnalyzerInput): string {
  return `You are a Post-hoc Analyzer Agent. You analyze blind comparison results to understand WHY the winner won and generate improvement suggestions.

## Your 8-Step Process

### Step 1: Read Comparison Result
The blind comparator determined the following:
- Winner: ${input.comparisonResult.winner}
- Skill Score: ${input.comparisonResult.skillScore.toFixed(2)}
- Baseline Score: ${input.comparisonResult.baselineScore.toFixed(2)}
- Delta (skill - baseline): ${input.comparisonResult.delta.toFixed(2)}
- Reasoning: ${input.comparisonResult.reasoning}

### Step 2: Read the Skill
Here is the SKILL.md content that was installed:
\`\`\`
${input.skillContent.slice(0, 8000)}
\`\`\`

### Step 3: Read Both Transcripts/Outputs
**Eval Prompt (what was asked):**
${input.evalPrompt}

**Skill Output (produced WITH the skill installed):**
\`\`\`
${input.skillOutput.slice(0, 15000)}
\`\`\`

**Baseline Output (produced WITHOUT any skill):**
\`\`\`
${input.baselineOutput.slice(0, 15000)}
\`\`\`
${input.humanFeedback && input.humanFeedback.length > 0 ? `
### Human Feedback
The following feedback was provided by a human reviewer on the skill output:
${input.humanFeedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

IMPORTANT: Incorporate this human feedback into your analysis. If reviewers flagged specific issues, prioritize suggestions that address them.
` : ''}
${input.additionalCases && input.additionalCases.length > 0 ? `
### Additional Comparison Cases
The following additional eval cases were also compared:
${input.additionalCases.map((c, i) => `
**Case ${i + 2}:**
- Eval Prompt: ${c.evalPrompt.slice(0, 500)}
- Winner: ${c.comparison.winner}, Delta: ${c.comparison.delta.toFixed(2)}
- Skill Output (excerpt): ${c.skillOutput.slice(0, 2000)}
- Baseline Output (excerpt): ${c.baselineOutput.slice(0, 2000)}
`).join('')}
Consider patterns across ALL cases, not just the primary one.
` : ''}
### Steps 4-8: Analyze and Generate Results

Now follow steps 4-8:
- Step 4: Analyze how well the skill output followed the skill's instructions (score 1-10)
- Step 5: Identify what made the winner better (be specific, quote from outputs)
- Step 6: Identify what held the loser back (be specific, quote from outputs)
- Step 7: Generate improvement suggestions (prioritized, categorized, with expected impact)
- Step 8: Write structured analysis results

## Suggestion Categories
| Category | Description |
|----------|-------------|
| instructions | Changes to the skill's prose instructions |
| tools | Scripts, templates, or utilities to add/modify |
| examples | Example inputs/outputs to include |
| error_handling | Guidance for handling failures |
| structure | Reorganization of skill content |
| references | External docs or resources to add |

## Priority Levels
- **high**: Would likely change the outcome of this comparison
- **medium**: Would improve quality but may not change win/loss
- **low**: Nice to have, marginal improvement

## Output Format
Output a single JSON object with this EXACT structure (no markdown code fences):

{
  "comparison_summary": {
    "winner": "skill" | "baseline" | "TIE",
    "comparator_reasoning": "Brief summary of why comparator chose winner",
    "skill_score": number,
    "baseline_score": number,
    "delta": number
  },
  "winner_strengths": [
    "Specific strength with quoted evidence from the output"
  ],
  "loser_weaknesses": [
    "Specific weakness with quoted evidence from the output"
  ],
  "instruction_following": {
    "skill": { "score": 1-10, "issues": ["specific issue"] },
    "baseline": { "score": 1-10, "issues": ["specific issue"] }
  },
  "improvement_suggestions": [
    {
      "priority": "high" | "medium" | "low",
      "category": "instructions" | "tools" | "examples" | "error_handling" | "structure" | "references",
      "suggestion": "Specific, actionable change to make",
      "expected_impact": "What this would improve",
      "evidence": "Quoted text from skill/output that supports this suggestion"
    }
  ],
  "transcript_insights": {
    "skill_execution_pattern": "Summary of how the skill output was produced",
    "baseline_execution_pattern": "Summary of how the baseline output was produced"
  }
}

## Guidelines
- Be SPECIFIC: Quote from skills and outputs, don't just say "instructions were unclear"
- Be ACTIONABLE: Suggestions should be concrete changes, not vague advice
- Focus on SKILL improvements: The goal is to improve the skill, not critique the agent
- Prioritize by IMPACT: Which changes would most likely have changed the outcome?
- Consider CAUSATION: Did the skill weakness actually cause the worse output?
- Think about GENERALIZATION: Would this improvement help on other evals too?

IMPORTANT: Output ONLY the JSON object. No preamble, no explanation, no markdown fences.`
}

// --- Response Parsing ---

function parseAnalyzerResponse(text: string, input: AnalyzerInput): AnalysisResult {
  const jsonStr = extractFirstJsonObject(text)
  const parsed = JSON.parse(jsonStr) as {
    comparison_summary?: {
      winner?: string
      comparator_reasoning?: string
      skill_score?: number
      baseline_score?: number
      delta?: number
    }
    winner_strengths?: string[]
    loser_weaknesses?: string[]
    instruction_following?: {
      skill?: { score?: number; issues?: string[] }
      baseline?: { score?: number; issues?: string[] }
    }
    improvement_suggestions?: Array<{
      priority?: string
      category?: string
      suggestion?: string
      expected_impact?: string
      evidence?: string
    }>
    transcript_insights?: {
      skill_execution_pattern?: string
      baseline_execution_pattern?: string
    }
  }

  return {
    comparison_summary: {
      winner: input.comparisonResult.winner,
      comparator_reasoning: parsed.comparison_summary?.comparator_reasoning || input.comparisonResult.reasoning,
      skill_score: input.comparisonResult.skillScore,
      baseline_score: input.comparisonResult.baselineScore,
      delta: input.comparisonResult.delta,
    },
    winner_strengths: parsed.winner_strengths || [],
    loser_weaknesses: parsed.loser_weaknesses || [],
    instruction_following: {
      skill: {
        score: parsed.instruction_following?.skill?.score ?? 5,
        issues: parsed.instruction_following?.skill?.issues || [],
      },
      baseline: {
        score: parsed.instruction_following?.baseline?.score ?? 5,
        issues: parsed.instruction_following?.baseline?.issues || [],
      },
    },
    improvement_suggestions: (parsed.improvement_suggestions || []).map(s => ({
      priority: (s.priority as SuggestionPriority) || 'medium',
      category: (s.category as SuggestionCategory) || 'instructions',
      suggestion: s.suggestion || '',
      expected_impact: s.expected_impact || '',
      evidence: s.evidence,
    })),
    transcript_insights: {
      skill_execution_pattern: parsed.transcript_insights?.skill_execution_pattern || '',
      baseline_execution_pattern: parsed.transcript_insights?.baseline_execution_pattern || '',
    },
  }
}

/**
 * Extract the first complete top-level JSON object from text using depth-counting.
 * Handles cases where LLM includes curly braces in reasoning text before the JSON.
 */
function extractFirstJsonObject(text: string): string {
  const firstBrace = text.indexOf('{')
  if (firstBrace === -1) {
    throw new Error('No JSON object found in analyzer response')
  }

  let depth = 0
  let inString = false
  let escape = false
  for (let i = firstBrace; i < text.length; i++) {
    const ch = text[i]
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
        return text.slice(firstBrace, i + 1)
      }
    }
  }

  throw new Error('Unterminated JSON object in analyzer response')
}
