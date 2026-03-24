/**
 * Phase 1: Deterministic quality checks for generated SKILL.md files.
 *
 * Fast regex/string checks — no LLM calls. Catches obvious boilerplate,
 * structural issues, and missing sections before the more expensive Phase 2
 * LLM review.
 *
 * PR 2: Expert SKILL.md Generation
 */

import { FORBIDDEN_PHRASES } from './skill-writing-guide'

export interface QualityCheck {
  passed: boolean
  issues: QualityIssue[]
  score: number // 1-10
}

export interface QualityIssue {
  check: string
  severity: 'error' | 'warning'
  message: string
  line?: number
}

/**
 * Run all Phase 1 deterministic checks on a generated SKILL.md.
 * Returns a score and list of issues. Score < 6 means "regenerate".
 */
export function validateSkillQuality(skillMd: string, intent: string): QualityCheck {
  const issues: QualityIssue[] = []
  const lines = skillMd.split('\n')

  // ── Check 1: No boilerplate phrases ──────────────────────────────────────
  for (const phrase of FORBIDDEN_PHRASES) {
    const idx = skillMd.toLowerCase().indexOf(phrase.toLowerCase())
    if (idx !== -1) {
      const lineNum = skillMd.slice(0, idx).split('\n').length
      issues.push({
        check: 'no-boilerplate',
        severity: 'error',
        message: `Contains boilerplate phrase: "${phrase}"`,
        line: lineNum,
      })
    }
  }

  // ── Check 2: Description includes trigger phrases ────────────────────────
  const frontmatter = extractFrontmatter(skillMd)
  const description = frontmatter.description || ''

  if (description.length > 0) {
    const triggerPhrasePatterns = [
      /use this skill when/i,
      /trigger when/i,
      /also trigger/i,
      /activate when/i,
      /use this whenever/i,
      /should trigger/i,
    ]
    const hasTriggerPhrase = triggerPhrasePatterns.some(p => p.test(description))
    if (!hasTriggerPhrase) {
      issues.push({
        check: 'pushy-description',
        severity: 'error',
        message: 'Description lacks trigger phrases (e.g., "Use this skill when...", "Also trigger when..."). Descriptions must be "pushy" to ensure reliable activation.',
      })
    }

    // Check description length
    if (description.length > 1024) {
      issues.push({
        check: 'description-length',
        severity: 'error',
        message: `Description is ${description.length} chars (max 1024).`,
      })
    }

    if (description.length < 50) {
      issues.push({
        check: 'description-length',
        severity: 'warning',
        message: `Description is only ${description.length} chars — likely too short to trigger reliably.`,
      })
    }
  } else {
    issues.push({
      check: 'missing-description',
      severity: 'error',
      message: 'No description found in frontmatter.',
    })
  }

  // ── Check 3: Has domain-specific content (not just restated intent) ──────
  const bodyWithoutFrontmatter = removeFrontmatter(skillMd)
  const intentWords = new Set(
    intent.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  )
  const bodyWords = bodyWithoutFrontmatter.toLowerCase().split(/\s+/)
  const bodyWordSet = new Set(bodyWords)

  // Count words in body that are NOT from the intent
  const uniqueBodyWords = Array.from(bodyWordSet).filter(w => w.length > 3 && !intentWords.has(w))
  const domainRichness = uniqueBodyWords.length / Math.max(bodyWordSet.size, 1)

  if (domainRichness < 0.3) {
    issues.push({
      check: 'domain-expertise',
      severity: 'warning',
      message: `Low domain richness (${(domainRichness * 100).toFixed(0)}%). The skill mostly restates the intent without adding domain expertise.`,
    })
  }

  // ── Check 4: Has anti-patterns/pitfalls section ──────────────────────────
  const hasAntiPatterns = /(?:anti.?pattern|pitfall|common mistake|gotcha|avoid|don't|do not)/i.test(bodyWithoutFrontmatter)
  if (!hasAntiPatterns) {
    issues.push({
      check: 'anti-patterns',
      severity: 'warning',
      message: 'No anti-patterns, pitfalls, or common mistakes section found. Domain-specific warnings are essential.',
    })
  }

  // ── Check 5: Has output format with at least one concrete example ────────
  const hasCodeBlock = /```[\s\S]*?```/.test(bodyWithoutFrontmatter)
  const hasExampleSection = /(?:##?\s*(?:example|output|sample|template))/i.test(bodyWithoutFrontmatter)
  if (!hasCodeBlock && !hasExampleSection) {
    issues.push({
      check: 'output-examples',
      severity: 'warning',
      message: 'No concrete output examples found. Include at least one full example showing good (and ideally bad) output.',
    })
  }

  // ── Check 6: Description <= 1024 chars (already checked above) ───────────
  // (handled in Check 2)

  // ── Check 7: Body < 500 lines ────────────────────────────────────────────
  const bodyLines = bodyWithoutFrontmatter.split('\n')
  if (bodyLines.length > 500) {
    issues.push({
      check: 'body-length',
      severity: 'warning',
      message: `Body is ${bodyLines.length} lines (recommended < 500). Consider splitting into references/ files.`,
    })
  }

  // ── Check 8: No all-caps MUST/NEVER without reasoning ───────────────────
  const capsDirectives = bodyWithoutFrontmatter.match(/\b(MUST|NEVER|ALWAYS|DO NOT|REQUIRED)\b/g) || []
  if (capsDirectives.length > 3) {
    // Check if there's reasoning nearby (look for "because", "since", "this ensures", etc.)
    const reasoningPatterns = /(?:because|since|this ensures|the reason|this is important|otherwise|without this|this prevents)/gi
    const reasoningCount = (bodyWithoutFrontmatter.match(reasoningPatterns) || []).length
    if (reasoningCount < capsDirectives.length / 2) {
      issues.push({
        check: 'theory-of-mind',
        severity: 'warning',
        message: `Found ${capsDirectives.length} all-caps directives (MUST/NEVER/ALWAYS) but only ${reasoningCount} explanations. Explain WHY, not just WHAT.`,
      })
    }
  }

  // ── Check 9: Has personality (not purely imperative/dry) ─────────────────
  const personalityIndicators = [
    /\b(?:note|tip|hint|pro tip)\b/i,
    /\b(?:you'll|you'd|you're|we|our|let's)\b/i,
    /(?:!|\?)/,
    /\b(?:careful|watch out|important|crucial|key insight)\b/i,
    /\b(?:common|typical|often|usually|tends to)\b/i,
  ]
  const personalityScore = personalityIndicators.filter(p => p.test(bodyWithoutFrontmatter)).length
  if (personalityScore < 2) {
    issues.push({
      check: 'personality',
      severity: 'warning',
      message: 'The skill reads as dry/template-like. Add personality appropriate to the domain.',
    })
  }

  // ── Check 10: Valid YAML frontmatter ──────────────────────────────────────
  if (!frontmatter.name) {
    issues.push({
      check: 'frontmatter-name',
      severity: 'error',
      message: 'Missing "name" field in YAML frontmatter.',
    })
  }

  // ── Check 11: Has "When to use" or similar trigger section ───────────────
  const hasTriggerSection = /(?:##?\s*(?:when to use|triggers?|activation|when this skill))/i.test(bodyWithoutFrontmatter)
  if (!hasTriggerSection) {
    issues.push({
      check: 'trigger-section',
      severity: 'warning',
      message: 'No "When to use" or trigger section found in body. Help the model know when to activate this skill.',
    })
  }

  // ── Score calculation ────────────────────────────────────────────────────
  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length

  let score = 10
  score -= errorCount * 2     // Each error costs 2 points
  score -= warningCount * 0.5 // Each warning costs 0.5 points
  score = Math.max(1, Math.min(10, Math.round(score)))

  return {
    passed: errorCount === 0 && score >= 6,
    issues,
    score,
  }
}

/**
 * Build a feedback string from quality issues for use in regeneration prompts.
 */
export function buildQualityFeedback(check: QualityCheck): string {
  if (check.issues.length === 0) return ''

  let feedback = 'The previous generation had these quality issues:\n'
  for (const issue of check.issues) {
    const prefix = issue.severity === 'error' ? 'ERROR' : 'WARNING'
    feedback += `- [${prefix}] ${issue.message}\n`
  }
  feedback += '\nFix ALL errors and address warnings in the next generation.'
  return feedback
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractFrontmatter(skillMd: string): { name?: string; description?: string } {
  const match = skillMd.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const yaml = match[1]
  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '')
  // Description can be multi-line or single-line
  let description = ''
  const descMatch = yaml.match(/^description:\s*(.+)$/m)
  if (descMatch) {
    description = descMatch[1].trim().replace(/^["']|["']$/g, '')
  }

  return { name, description }
}

function removeFrontmatter(skillMd: string): string {
  return skillMd.replace(/^---\n[\s\S]*?\n---\n*/, '')
}
