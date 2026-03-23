/**
 * Seed script: loads example skills, eval suites, and sample data
 * into a fresh SkillForge instance.
 *
 * Usage: npx ts-node seed/seed.ts
 *   or:  npx tsx seed/seed.ts
 */

import { PrismaClient } from '@prisma/client'
import { initSkillGitRepo, createVersion } from '../src/lib/services/git-storage'

const prisma = new PrismaClient()

const SEED_SKILLS = [
  {
    name: 'Code Review Helper',
    description: 'Performs thorough code review with inline suggestions, identifies potential bugs, and checks for best practices.',
    skillMd: `---
name: code-review-helper
description: "Performs thorough code review with inline suggestions, identifies potential bugs, and checks for best practices."
---

# Code Review Helper

## When to use
Use this skill when the user asks you to review code, check for bugs, or provide code feedback.

## Instructions

1. Read the code carefully, understanding the overall structure and purpose
2. Check for common issues:
   - Potential null/undefined errors
   - Missing error handling
   - Security vulnerabilities (SQL injection, XSS, etc.)
   - Performance concerns
   - Code style inconsistencies
3. For each issue found:
   - Cite the specific line or section
   - Explain why it's a problem
   - Suggest a concrete fix
4. Provide a summary with:
   - Overall assessment (good/needs work/critical issues)
   - Number of issues by severity
   - Suggested priority order for fixes

## Gotchas
- Don't nitpick formatting if the project has an auto-formatter
- Consider the project's existing patterns before suggesting changes
- Not all warnings are bugs — distinguish between "must fix" and "consider fixing"

## Validation
- Every issue cited must reference a specific code location
- Suggestions must be syntactically valid code
- Summary must include severity counts
`,
    triggerCases: [
      { key: 'review-code', name: 'Should trigger on code review request', prompt: 'Can you review this pull request for me?', shouldTrigger: true, split: 'train' },
      { key: 'check-bugs', name: 'Should trigger on bug check request', prompt: 'Check this code for potential bugs', shouldTrigger: true, split: 'train' },
      { key: 'review-pr', name: 'Should trigger on PR review', prompt: 'Review my latest changes and suggest improvements', shouldTrigger: true, split: 'validation' },
      { key: 'no-trigger-deploy', name: 'Should NOT trigger on deployment', prompt: 'Deploy the application to production', shouldTrigger: false, split: 'train' },
      { key: 'no-trigger-write', name: 'Should NOT trigger on writing new code', prompt: 'Write a new React component for user settings', shouldTrigger: false, split: 'holdout' },
    ],
    outputCases: [
      { key: 'review-quality', name: 'Review includes severity levels', prompt: 'Review this function:\nfunction divide(a, b) { return a / b; }', expectedOutcome: 'Should identify division by zero risk', assertionType: 'contains', assertionValue: 'division', split: 'train' },
      { key: 'review-summary', name: 'Review includes summary', prompt: 'Review this code:\nconst data = JSON.parse(input)', expectedOutcome: 'Should flag missing try/catch', assertionType: 'contains', assertionValue: 'error', split: 'validation' },
    ],
  },
  {
    name: 'Test Writer',
    description: 'Generates comprehensive unit and integration tests for existing code with proper mocking and edge case coverage.',
    skillMd: `---
name: test-writer
description: "Generates comprehensive unit and integration tests for existing code with proper mocking and edge case coverage."
---

# Test Writer

## When to use
Use this skill when the user asks you to write tests, add test coverage, or create test suites for existing code.

## Instructions

1. Analyze the code to understand:
   - Public API surface (exported functions, classes, methods)
   - Dependencies that need mocking
   - Edge cases and error paths
2. Determine the appropriate testing framework:
   - Check for existing test files to match conventions
   - Default to Jest for JavaScript/TypeScript, pytest for Python
3. Write tests covering:
   - Happy path for each public function
   - Edge cases (empty input, null, boundary values)
   - Error handling paths
   - Integration between components (if applicable)
4. For each test:
   - Use descriptive test names ("it should return empty array when input is null")
   - Include arrange/act/assert structure
   - Mock external dependencies
5. Verify all tests pass before presenting

## Gotchas
- Match the existing test framework and patterns in the project
- Don't test implementation details, test behavior
- Mock at the boundary, not deep internals
- Check for existing test utilities/helpers before writing new ones

## Validation
- All generated tests must be syntactically valid
- Test names must be descriptive
- Must include at least one edge case test
`,
    triggerCases: [
      { key: 'write-tests', name: 'Should trigger on test writing request', prompt: 'Write unit tests for this module', shouldTrigger: true, split: 'train' },
      { key: 'add-coverage', name: 'Should trigger on coverage request', prompt: 'Add test coverage for the auth service', shouldTrigger: true, split: 'validation' },
      { key: 'no-trigger-fix', name: 'Should NOT trigger on bug fix', prompt: 'Fix the login bug on the settings page', shouldTrigger: false, split: 'train' },
      { key: 'no-trigger-docs', name: 'Should NOT trigger on documentation', prompt: 'Write documentation for the API endpoints', shouldTrigger: false, split: 'holdout' },
    ],
    outputCases: [
      { key: 'test-structure', name: 'Tests use describe/it blocks', prompt: 'Write tests for: function add(a: number, b: number): number { return a + b; }', expectedOutcome: 'Should produce structured tests', assertionType: 'contains', assertionValue: 'describe', split: 'train' },
      { key: 'test-edge-cases', name: 'Tests include edge cases', prompt: 'Write tests for: function first(arr: any[]) { return arr[0]; }', expectedOutcome: 'Should test empty array', assertionType: 'contains', assertionValue: 'empty', split: 'validation' },
    ],
  },
]

async function seed() {
  console.log('Seeding SkillForge with example data...\n')

  for (const skill of SEED_SKILLS) {
    console.log(`Creating skill: ${skill.name}`)

    // 1. Create repo
    const slug = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const repo = await prisma.skillRepo.create({
      data: {
        slug,
        displayName: skill.name,
        description: skill.description,
        gitRepoPath: '', // Will be set after git init
      },
    })

    // 2. Init git repo (pass repo.id, returns full path)
    const repoPath = await initSkillGitRepo(repo.id)
    await prisma.skillRepo.update({
      where: { id: repo.id },
      data: { gitRepoPath: repoPath },
    })

    // 3. Create initial version
    const commitSha = await createVersion(repoPath, [
      { path: 'SKILL.md', content: skill.skillMd, size: Buffer.byteLength(skill.skillMd) },
    ], `Initial version of ${skill.name}`)

    await prisma.skillVersion.create({
      data: {
        skillRepoId: repo.id,
        gitCommitSha: commitSha,
        commitMessage: `Initial version of ${skill.name}`,
        createdBy: 'seed',
      },
    })

    // 4. Create trigger eval suite
    const triggerSuite = await prisma.evalSuite.create({
      data: {
        skillRepoId: repo.id,
        name: `Trigger Suite for ${skill.name}`,
        type: 'trigger',
        splitPolicy: 'random',
      },
    })

    for (const c of skill.triggerCases) {
      await prisma.evalCase.create({
        data: {
          evalSuiteId: triggerSuite.id,
          key: c.key,
          name: c.name,
          prompt: c.prompt,
          shouldTrigger: c.shouldTrigger,
          split: c.split,
          tags: '[]',
        },
      })
    }

    // 5. Create output eval suite
    const outputSuite = await prisma.evalSuite.create({
      data: {
        skillRepoId: repo.id,
        name: `Output Suite for ${skill.name}`,
        type: 'output',
        splitPolicy: 'random',
      },
    })

    for (const c of skill.outputCases) {
      await prisma.evalCase.create({
        data: {
          evalSuiteId: outputSuite.id,
          key: c.key,
          name: c.name,
          prompt: c.prompt,
          expectedOutcome: c.expectedOutcome,
          split: c.split,
          tags: '[]',
          configJson: JSON.stringify({
            assertions: [{ type: c.assertionType, value: c.assertionValue }],
          }),
        },
      })
    }

    console.log(`  - Repo: ${repo.id}`)
    console.log(`  - Trigger suite: ${triggerSuite.id} (${skill.triggerCases.length} cases)`)
    console.log(`  - Output suite: ${outputSuite.id} (${skill.outputCases.length} cases)`)
    console.log()
  }

  console.log('Seed complete!')
}

seed()
  .catch(err => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
