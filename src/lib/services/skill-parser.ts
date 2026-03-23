import matter from 'gray-matter'
import type { ParsedSkill, SkillFrontmatter } from '@/types/skill'

/**
 * Parse a SKILL.md file into frontmatter and body.
 * Uses gray-matter for YAML frontmatter extraction.
 */
export function parseSkillMd(content: string): ParsedSkill {
  try {
    const parsed = matter(content)
    return {
      frontmatter: parsed.data as SkillFrontmatter,
      body: parsed.content.trim(),
      rawContent: content,
      hasFrontmatter: Object.keys(parsed.data).length > 0,
    }
  } catch {
    // If frontmatter parsing fails, treat entire content as body
    return {
      frontmatter: {},
      body: content.trim(),
      rawContent: content,
      hasFrontmatter: false,
    }
  }
}

/**
 * Count approximate tokens in text (rough word-based estimate).
 * Uses ~4 chars per token as a rough approximation.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Count lines in text.
 */
export function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}

/**
 * Serialize a ParsedSkill back to SKILL.md format.
 */
export function serializeSkillMd(skill: ParsedSkill): string {
  if (!skill.hasFrontmatter || Object.keys(skill.frontmatter).length === 0) {
    return skill.body
  }

  const fm = matter.stringify(skill.body, skill.frontmatter)
  return fm
}
