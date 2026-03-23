import type { ParsedSkill, LintIssue, LintReport, ScorecardEntry, SkillFile } from '@/types/skill'
import { estimateTokenCount, countLines } from '@/lib/services/skill-parser'

const MAX_DESCRIPTION_LENGTH = 1024
const RECOMMENDED_MAX_LINES = 500
const RECOMMENDED_MAX_TOKENS = 8000

// Generic filler phrases that indicate low-quality instructions
const GENERIC_FILLER_PATTERNS = [
  /handle\s+errors?\s+appropriately/i,
  /follow\s+best\s+practices/i,
  /use\s+common\s+sense/i,
  /do\s+the\s+right\s+thing/i,
  /be\s+careful/i,
  /make\s+sure\s+to/i,
  /don'?t\s+forget\s+to/i,
  /as\s+needed/i,
  /if\s+applicable/i,
  /when\s+appropriate/i,
]

/**
 * Run the full linting pipeline on a skill folder.
 */
export function lintSkill(
  skillMd: ParsedSkill,
  files: SkillFile[],
  directoryName?: string
): LintReport {
  const issues: LintIssue[] = []

  // A. Hard validation (must pass)
  runHardValidation(skillMd, files, directoryName, issues)

  // B. Strong warnings
  runStrongWarnings(skillMd, files, issues)

  // C. Advisory recommendations
  runAdvisoryRecommendations(skillMd, files, issues)

  // Generate scorecard
  const scorecard = generateScorecard(skillMd, files, issues)

  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.filter(i => i.severity === 'info').length

  return {
    issues,
    scorecard,
    passed: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
  }
}

function runHardValidation(
  skillMd: ParsedSkill,
  files: SkillFile[],
  directoryName: string | undefined,
  issues: LintIssue[]
) {
  const hasSkillMd = files.some(f => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'))

  // SKILL.md must exist
  if (!hasSkillMd) {
    issues.push({
      severity: 'error',
      category: 'spec-correctness',
      rule: 'skill-md-exists',
      message: 'SKILL.md file is required but not found',
      file: 'SKILL.md',
      evidence: 'No SKILL.md file found in the skill folder',
    })
    return // Can't validate further without SKILL.md
  }

  // frontmatter must parse
  if (skillMd.rawContent.startsWith('---') && !skillMd.hasFrontmatter) {
    issues.push({
      severity: 'error',
      category: 'spec-correctness',
      rule: 'frontmatter-parse',
      message: 'Frontmatter exists but failed to parse as valid YAML',
      file: 'SKILL.md',
      line: 1,
      evidence: 'Content starts with --- but YAML parsing failed',
    })
  }

  // name must exist (from frontmatter or directory name)
  const name = skillMd.frontmatter.name
  if (!name && !directoryName) {
    issues.push({
      severity: 'error',
      category: 'spec-correctness',
      rule: 'name-required',
      message: 'Skill must have a name in frontmatter or a valid directory name',
      file: 'SKILL.md',
      evidence: 'No name field in frontmatter and no directory name supplied',
    })
  }

  // name must match directory rules (alphanumeric, hyphens, underscores)
  const effectiveName = name || directoryName
  if (effectiveName && !/^[a-zA-Z0-9_-]+$/.test(effectiveName)) {
    issues.push({
      severity: 'error',
      category: 'spec-correctness',
      rule: 'name-format',
      message: `Skill name "${effectiveName}" contains invalid characters. Use only letters, numbers, hyphens, and underscores`,
      file: 'SKILL.md',
      evidence: `Name: "${effectiveName}"`,
    })
  }

  // description must exist
  if (!skillMd.frontmatter.description) {
    issues.push({
      severity: 'error',
      category: 'spec-correctness',
      rule: 'description-required',
      message: 'Skill must have a description in frontmatter',
      file: 'SKILL.md',
      evidence: 'No description field in frontmatter',
    })
  }

  // description length <= 1024 chars
  if (skillMd.frontmatter.description && skillMd.frontmatter.description.length > MAX_DESCRIPTION_LENGTH) {
    issues.push({
      severity: 'error',
      category: 'spec-correctness',
      rule: 'description-length',
      message: `Description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${skillMd.frontmatter.description.length} chars)`,
      file: 'SKILL.md',
      evidence: `Description length: ${skillMd.frontmatter.description.length}`,
    })
  }

  // Check for duplicate file paths
  const paths = files.map(f => f.path)
  const duplicates = paths.filter((p, i) => paths.indexOf(p) !== i)
  if (duplicates.length > 0) {
    issues.push({
      severity: 'error',
      category: 'spec-correctness',
      rule: 'no-duplicate-paths',
      message: `Duplicate file paths found: ${duplicates.join(', ')}`,
      file: 'SKILL.md',
      evidence: `Duplicates: ${duplicates.join(', ')}`,
    })
  }
}

function runStrongWarnings(
  skillMd: ParsedSkill,
  _files: SkillFile[],
  issues: LintIssue[]
) {
  const { frontmatter, body } = skillMd

  // description describes implementation instead of user intent
  if (frontmatter.description) {
    const desc = frontmatter.description.toLowerCase()
    const implementationPatterns = [
      /^this\s+(skill|tool|script)\s+(is|was|will|implements|uses|runs|executes)/,
      /^a\s+(python|node|bash|shell)\s+script/,
      /^implements\s+/,
      /^uses\s+/,
    ]
    for (const pattern of implementationPatterns) {
      if (pattern.test(desc)) {
        issues.push({
          severity: 'warning',
          category: 'trigger-quality',
          rule: 'description-user-intent',
          message: 'Description should describe user intent and when to use the skill, not implementation details',
          file: 'SKILL.md',
          evidence: `Description starts with implementation language: "${frontmatter.description.slice(0, 80)}..."`,
        })
        break
      }
    }

    // description lacks "when to use it" cues
    const whenPatterns = [/when/i, /if\s+you/i, /use\s+this/i, /for\s+/i, /helps?\s+/i]
    const hasWhenCue = whenPatterns.some(p => p.test(desc))
    if (!hasWhenCue && desc.length < 100) {
      issues.push({
        severity: 'warning',
        category: 'trigger-quality',
        rule: 'description-when-cues',
        message: 'Description should include cues about when to use this skill',
        file: 'SKILL.md',
        evidence: `Description: "${frontmatter.description}"`,
      })
    }
  }

  // SKILL.md exceeds recommended line/token budget
  const lineCount = countLines(body)
  if (lineCount > RECOMMENDED_MAX_LINES) {
    issues.push({
      severity: 'warning',
      category: 'context-efficiency',
      rule: 'body-too-long-lines',
      message: `SKILL.md body has ${lineCount} lines, exceeding the recommended ${RECOMMENDED_MAX_LINES} line budget`,
      file: 'SKILL.md',
      evidence: `${lineCount} lines`,
    })
  }

  const tokenCount = estimateTokenCount(body)
  if (tokenCount > RECOMMENDED_MAX_TOKENS) {
    issues.push({
      severity: 'warning',
      category: 'context-efficiency',
      rule: 'body-too-long-tokens',
      message: `SKILL.md body has ~${tokenCount} tokens, exceeding the recommended ~${RECOMMENDED_MAX_TOKENS} token budget`,
      file: 'SKILL.md',
      evidence: `~${tokenCount} tokens`,
    })
  }

  // body contains generic filler
  for (const pattern of GENERIC_FILLER_PATTERNS) {
    const match = body.match(pattern)
    if (match) {
      // Find the line number
      const lines = body.split('\n')
      const lineIdx = lines.findIndex(l => pattern.test(l))
      issues.push({
        severity: 'warning',
        category: 'instruction-quality',
        rule: 'no-generic-filler',
        message: `Body contains generic filler: "${match[0]}". Be specific about what the agent should do`,
        file: 'SKILL.md',
        line: lineIdx >= 0 ? lineIdx + 1 : undefined,
        evidence: `Found: "${match[0]}"`,
      })
    }
  }

  // Too many equivalent options listed with no default
  const optionListPattern = /(?:option\s*\d|alternative\s*\d|choice\s*\d|or\s+you\s+can|alternatively)/gi
  const optionMatches = body.match(optionListPattern)
  if (optionMatches && optionMatches.length >= 3) {
    issues.push({
      severity: 'warning',
      category: 'instruction-quality',
      rule: 'too-many-options',
      message: 'Multiple equivalent options listed without a clear default. Pick a default and mention alternatives briefly',
      file: 'SKILL.md',
      evidence: `Found ${optionMatches.length} option-like patterns`,
    })
  }
}

function runAdvisoryRecommendations(
  skillMd: ParsedSkill,
  files: SkillFile[],
  issues: LintIssue[]
) {
  const { body } = skillMd
  const hasReferences = files.some(f => f.path.startsWith('references/'))
  const hasScripts = files.some(f => f.path.startsWith('scripts/'))

  // Suggest splitting body into references/ for progressive disclosure
  const bodyLines = countLines(body)
  if (bodyLines > 200 && !hasReferences) {
    issues.push({
      severity: 'info',
      category: 'context-efficiency',
      rule: 'consider-references',
      message: 'Body is long. Consider splitting detailed sections into references/ for progressive disclosure',
      file: 'SKILL.md',
      evidence: `${bodyLines} lines without any references/ files`,
    })
  }

  // Suggest moving repeated deterministic logic into scripts/
  const codeBlockPattern = /```[\s\S]*?```/g
  const codeBlocks = body.match(codeBlockPattern) || []
  if (codeBlocks.length >= 3 && !hasScripts) {
    issues.push({
      severity: 'info',
      category: 'scriptability',
      rule: 'consider-scripts',
      message: 'Multiple code blocks found. Consider moving repeated deterministic logic into scripts/',
      file: 'SKILL.md',
      evidence: `${codeBlocks.length} code blocks without any scripts/ files`,
    })
  }

  // Suggest adding examples
  const hasExamples = /## example/i.test(body) || /### example/i.test(body)
  if (!hasExamples) {
    issues.push({
      severity: 'info',
      category: 'instruction-quality',
      rule: 'add-examples',
      message: 'Consider adding examples to help the agent understand expected behavior',
      file: 'SKILL.md',
      evidence: 'No "Example" section found',
    })
  }

  // Suggest adding gotchas section
  const hasGotchas = /gotcha|pitfall|common\s+mistake|watch\s+out/i.test(body)
  if (!hasGotchas) {
    issues.push({
      severity: 'info',
      category: 'instruction-quality',
      rule: 'add-gotchas',
      message: 'Consider adding a gotchas/pitfalls section to capture known failure modes',
      file: 'SKILL.md',
      evidence: 'No gotchas/pitfalls section found',
    })
  }

  // Suggest adding validation loop
  const hasValidation = /validat|verify|check|assert|confirm/i.test(body)
  if (!hasValidation) {
    issues.push({
      severity: 'info',
      category: 'validation-discipline',
      rule: 'add-validation',
      message: 'Consider adding a validation/verification step to ensure output correctness',
      file: 'SKILL.md',
      evidence: 'No validation-related language found',
    })
  }
}

function generateScorecard(
  skillMd: ParsedSkill,
  files: SkillFile[],
  issues: LintIssue[]
): ScorecardEntry[] {
  const categories = [
    'spec-correctness',
    'trigger-quality',
    'scope-clarity',
    'context-efficiency',
    'instruction-quality',
    'safety-control',
    'validation-discipline',
    'scriptability',
    'eval-coverage',
    'observed-execution-quality',
  ]

  return categories.map(category => {
    const categoryIssues = issues.filter(i => i.category === category)
    const errors = categoryIssues.filter(i => i.severity === 'error')
    const warnings = categoryIssues.filter(i => i.severity === 'warning')

    let rating: ScorecardEntry['rating'] = 'unknown'
    if (category === 'observed-execution-quality' || category === 'eval-coverage') {
      rating = 'unknown' // needs eval runs
    } else if (errors.length > 0) {
      rating = 'poor'
    } else if (warnings.length > 0) {
      rating = 'fair'
    } else {
      rating = 'good'
    }

    // Special case: scope-clarity based on body analysis
    if (category === 'scope-clarity') {
      const hasScope = skillMd.body.length > 0 && skillMd.frontmatter.description
      if (!hasScope) {
        rating = 'poor'
      } else if (skillMd.body.length < 50) {
        rating = 'fair'
      }
    }

    // Safety/control based on frontmatter
    if (category === 'safety-control') {
      const hasSafetyFields = skillMd.frontmatter['disable-model-invocation'] !== undefined ||
        skillMd.frontmatter['allowed-tools'] !== undefined
      if (!hasSafetyFields && rating === 'unknown') {
        rating = 'fair'
      }
    }

    return {
      category,
      rating,
      evidence: categoryIssues.map(i => `[${i.severity}] ${i.message}`),
    }
  })
}
