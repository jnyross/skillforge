import { describe, it, expect } from 'vitest'
import { lintSkill } from './skill-linter'
import { parseSkillMd } from '@/lib/services/skill-parser'
import type { SkillFile } from '@/types/skill'

function makeFiles(skillMdContent: string, extraFiles: SkillFile[] = []): SkillFile[] {
  return [
    { path: 'SKILL.md', content: skillMdContent, size: skillMdContent.length },
    ...extraFiles,
  ]
}

describe('lintSkill', () => {
  describe('hard validation', () => {
    it('fails when SKILL.md is missing', () => {
      const parsed = parseSkillMd('')
      const files: SkillFile[] = []
      const report = lintSkill(parsed, files, 'test-skill')

      expect(report.passed).toBe(false)
      expect(report.errorCount).toBeGreaterThan(0)
      expect(report.issues.some(i => i.rule === 'skill-md-exists')).toBe(true)
    })

    it('fails when name is missing and no directory name', () => {
      const content = `---
description: A test skill
---
Body`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.passed).toBe(false)
      expect(report.issues.some(i => i.rule === 'name-required')).toBe(true)
    })

    it('passes when name comes from directory', () => {
      const content = `---
description: A test skill
---
Body`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files, 'my-skill')

      expect(report.issues.some(i => i.rule === 'name-required')).toBe(false)
    })

    it('fails with invalid name format', () => {
      const content = `---
name: "my skill with spaces!"
description: A test skill
---
Body`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.issues.some(i => i.rule === 'name-format')).toBe(true)
    })

    it('fails when description is missing', () => {
      const content = `---
name: test-skill
---
Body`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.issues.some(i => i.rule === 'description-required')).toBe(true)
    })

    it('fails when description exceeds 1024 chars', () => {
      const longDesc = 'x'.repeat(1025)
      const content = `---
name: test-skill
description: "${longDesc}"
---
Body`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.issues.some(i => i.rule === 'description-length')).toBe(true)
    })

    it('fails on duplicate file paths', () => {
      const content = `---
name: test-skill
description: A test
---
Body`
      const parsed = parseSkillMd(content)
      const files = [
        { path: 'SKILL.md', content, size: content.length },
        { path: 'refs/a.md', content: 'a', size: 1 },
        { path: 'refs/a.md', content: 'b', size: 1 },
      ]
      const report = lintSkill(parsed, files)

      expect(report.issues.some(i => i.rule === 'no-duplicate-paths')).toBe(true)
    })

    it('passes with valid skill', () => {
      const content = `---
name: test-skill
description: A skill that helps with testing when you need to verify code
---

# Instructions

Test the code carefully.

## Examples

Here is an example of how to test:

\`\`\`bash
npm test
\`\`\`

## Gotchas

Watch out for async tests.

## Validation

Always verify test results.`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.passed).toBe(true)
      expect(report.errorCount).toBe(0)
    })
  })

  describe('strong warnings', () => {
    it('warns about implementation-focused descriptions', () => {
      const content = `---
name: test-skill
description: This skill implements a Python script for parsing
---
Body`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.issues.some(i => i.rule === 'description-user-intent')).toBe(true)
    })

    it('warns about generic filler in body', () => {
      const content = `---
name: test-skill
description: A skill for testing
---

# Instructions

Handle errors appropriately and follow best practices.`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.issues.some(i => i.rule === 'no-generic-filler')).toBe(true)
    })

    it('warns about overly long body', () => {
      const longBody = 'line\n'.repeat(600)
      const content = `---
name: test-skill
description: A skill for testing
---

${longBody}`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.issues.some(i => i.rule === 'body-too-long-lines')).toBe(true)
    })
  })

  describe('advisory recommendations', () => {
    it('suggests adding examples', () => {
      const content = `---
name: test-skill
description: A skill for testing
---

# Instructions

Do some work.`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.issues.some(i => i.rule === 'add-examples')).toBe(true)
    })

    it('suggests adding gotchas', () => {
      const content = `---
name: test-skill
description: A skill for testing
---

# Instructions

Do some work.`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.issues.some(i => i.rule === 'add-gotchas')).toBe(true)
    })
  })

  describe('scorecard', () => {
    it('generates a scorecard with all categories', () => {
      const content = `---
name: test-skill
description: A skill for testing
---
Body`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      expect(report.scorecard).toHaveLength(10)
      const categories = report.scorecard.map(s => s.category)
      expect(categories).toContain('spec-correctness')
      expect(categories).toContain('trigger-quality')
      expect(categories).toContain('instruction-quality')
      expect(categories).toContain('context-efficiency')
    })

    it('rates spec-correctness as good when no errors', () => {
      const content = `---
name: test-skill
description: A skill that helps with testing when you need code verification
---

# Instructions

Test things carefully.

## Examples

Example here.

## Gotchas

Watch out.

## Validation

Verify results.`
      const parsed = parseSkillMd(content)
      const files = makeFiles(content)
      const report = lintSkill(parsed, files)

      const specScore = report.scorecard.find(s => s.category === 'spec-correctness')
      expect(specScore?.rating).toBe('good')
    })
  })
})
