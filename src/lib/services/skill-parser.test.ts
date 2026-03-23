import { describe, it, expect } from 'vitest'
import { parseSkillMd, estimateTokenCount, countLines, serializeSkillMd } from './skill-parser'

describe('parseSkillMd', () => {
  it('parses valid frontmatter and body', () => {
    const content = `---
name: my-skill
description: A skill that helps with testing
---

# Instructions

Do something useful.`

    const result = parseSkillMd(content)
    expect(result.hasFrontmatter).toBe(true)
    expect(result.frontmatter.name).toBe('my-skill')
    expect(result.frontmatter.description).toBe('A skill that helps with testing')
    expect(result.body).toContain('# Instructions')
    expect(result.body).toContain('Do something useful.')
  })

  it('handles missing frontmatter', () => {
    const content = `# Just a body

No frontmatter here.`

    const result = parseSkillMd(content)
    expect(result.hasFrontmatter).toBe(false)
    expect(result.frontmatter).toEqual({})
    expect(result.body).toContain('# Just a body')
  })

  it('handles empty content', () => {
    const result = parseSkillMd('')
    expect(result.hasFrontmatter).toBe(false)
    expect(result.body).toBe('')
  })

  it('handles frontmatter with extra fields', () => {
    const content = `---
name: test
description: test desc
disable-model-invocation: true
allowed-tools:
  - bash
  - editor
custom-field: value
---

Body content.`

    const result = parseSkillMd(content)
    expect(result.hasFrontmatter).toBe(true)
    expect(result.frontmatter.name).toBe('test')
    expect(result.frontmatter['disable-model-invocation']).toBe(true)
    expect(result.frontmatter['allowed-tools']).toEqual(['bash', 'editor'])
    expect(result.frontmatter['custom-field']).toBe('value')
  })

  it('preserves raw content', () => {
    const content = `---
name: test
---
Body`

    const result = parseSkillMd(content)
    expect(result.rawContent).toBe(content)
  })
})

describe('estimateTokenCount', () => {
  it('estimates tokens based on character count', () => {
    const text = 'Hello world' // 11 chars => ~3 tokens
    expect(estimateTokenCount(text)).toBeGreaterThan(0)
  })

  it('returns 0 for empty text', () => {
    expect(estimateTokenCount('')).toBe(0)
  })
})

describe('countLines', () => {
  it('counts lines correctly', () => {
    expect(countLines('line1\nline2\nline3')).toBe(3)
    expect(countLines('single line')).toBe(1)
  })

  it('returns 0 for empty text', () => {
    expect(countLines('')).toBe(0)
  })
})

describe('serializeSkillMd', () => {
  it('round-trips a parsed skill', () => {
    const content = `---
name: my-skill
description: A test skill
---

# Instructions

Do things.`

    const parsed = parseSkillMd(content)
    const serialized = serializeSkillMd(parsed)

    // Re-parse to verify
    const reparsed = parseSkillMd(serialized)
    expect(reparsed.frontmatter.name).toBe('my-skill')
    expect(reparsed.frontmatter.description).toBe('A test skill')
    expect(reparsed.body).toContain('# Instructions')
  })

  it('serializes body-only skill without frontmatter', () => {
    const parsed = parseSkillMd('Just body content')
    const serialized = serializeSkillMd(parsed)
    expect(serialized).toBe('Just body content')
  })
})
