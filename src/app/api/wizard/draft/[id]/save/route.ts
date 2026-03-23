import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { initSkillGitRepo, createVersion } from '@/lib/services/git-storage'
import path from 'path'

const DATA_DIR = process.env.DATA_DIR || './data/skill-repos'

/**
 * POST /api/wizard/draft/:id/save
 * Save the generated wizard draft as a new skill repo with version, trigger suite, and output suite.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const draft = await prisma.wizardDraft.findUnique({
    where: { id: params.id },
  })

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (draft.status !== 'review') {
    return NextResponse.json(
      { error: `Cannot save from status "${draft.status}". Draft must be in "review" status.` },
      { status: 400 }
    )
  }

  // Allow overriding the generated skill content and repo name
  const body = await request.json().catch(() => ({})) as {
    skillMd?: string
    repoName?: string
    repoDescription?: string
  }

  const skillMd = body.skillMd || draft.generatedSkill
  if (!skillMd) {
    return NextResponse.json({ error: 'No skill content to save' }, { status: 400 })
  }

  // Parse generated evals
  let generatedEvals: {
    triggerSuite?: { name: string; cases: Array<{ key: string; name: string; prompt: string; shouldTrigger?: boolean; expectedOutcome?: string; assertionType?: string; assertionValue?: string; split: string; tags?: string[] }> }
    outputSuite?: { name: string; cases: Array<{ key: string; name: string; prompt: string; expectedOutcome?: string; assertionType?: string; assertionValue?: string; split: string; tags?: string[] }> }
    files?: Array<{ path: string; content: string }>
  } = {}
  try {
    generatedEvals = JSON.parse(draft.generatedEvals)
  } catch {
    // No evals to create
  }

  try {
    // Extract skill name from frontmatter
    const nameMatch = skillMd.match(/^name:\s*(.+)$/m)
    const skillName = body.repoName || (nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : `wizard-skill-${Date.now()}`)
    const slug = skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const displayName = skillName.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    const repoPath = path.resolve(DATA_DIR, slug)

    // 1. Create skill repo
    const repo = await prisma.skillRepo.create({
      data: {
        slug,
        displayName,
        description: body.repoDescription || draft.intent.slice(0, 500) || 'Created by SkillForge Wizard',
        gitRepoPath: repoPath,
      },
    })

    // 2. Initialize git repo
    await initSkillGitRepo(repoPath)

    // 3. Prepare files for the initial version
    const files: Array<{ path: string; content: string; size: number }> = [
      { path: 'SKILL.md', content: skillMd, size: Buffer.byteLength(skillMd) },
    ]

    // Add any generated reference/script files
    if (generatedEvals.files) {
      for (const f of generatedEvals.files) {
        files.push({ path: f.path, content: f.content, size: Buffer.byteLength(f.content) })
      }
    }

    // 4. Create initial version
    const commitSha = await createVersion(repoPath, files, 'Initial skill created by wizard')

    // 5. Save version to DB
    const dbVersion = await prisma.skillVersion.create({
      data: {
        skillRepoId: repo.id,
        gitCommitSha: commitSha,
        parentVersionId: null,
        commitMessage: 'Initial skill created by wizard',
        createdBy: 'wizard',
      },
    })

    // 6. Create eval suites and cases
    const createdSuites: Array<{ id: string; name: string; type: string; caseCount: number }> = []

    // Trigger suite
    if (generatedEvals.triggerSuite && generatedEvals.triggerSuite.cases.length > 0) {
      const triggerSuite = await prisma.evalSuite.create({
        data: {
          skillRepoId: repo.id,
          name: generatedEvals.triggerSuite.name,
          type: 'trigger',
          splitPolicy: 'random',
        },
      })

      for (const c of generatedEvals.triggerSuite.cases) {
        await prisma.evalCase.create({
          data: {
            evalSuiteId: triggerSuite.id,
            key: c.key,
            name: c.name,
            prompt: c.prompt,
            shouldTrigger: c.shouldTrigger ?? true,
            split: c.split || 'train',
            tags: c.tags ? JSON.stringify(c.tags) : '[]',
          },
        })
      }

      createdSuites.push({
        id: triggerSuite.id,
        name: triggerSuite.name,
        type: 'trigger',
        caseCount: generatedEvals.triggerSuite.cases.length,
      })
    }

    // Output suite
    if (generatedEvals.outputSuite && generatedEvals.outputSuite.cases.length > 0) {
      const outputSuite = await prisma.evalSuite.create({
        data: {
          skillRepoId: repo.id,
          name: generatedEvals.outputSuite.name,
          type: 'output',
          splitPolicy: 'random',
        },
      })

      for (const c of generatedEvals.outputSuite.cases) {
        await prisma.evalCase.create({
          data: {
            evalSuiteId: outputSuite.id,
            key: c.key,
            name: c.name,
            prompt: c.prompt,
            expectedOutcome: c.expectedOutcome || '',
            split: c.split || 'train',
            tags: c.tags ? JSON.stringify(c.tags) : '[]',
            configJson: JSON.stringify({
              assertions: c.assertionType && c.assertionValue
                ? [{ type: c.assertionType, value: c.assertionValue }]
                : [],
            }),
          },
        })
      }

      createdSuites.push({
        id: outputSuite.id,
        name: outputSuite.name,
        type: 'output',
        caseCount: generatedEvals.outputSuite.cases.length,
      })
    }

    // 7. Update draft with saved references
    await prisma.wizardDraft.update({
      where: { id: params.id },
      data: {
        status: 'saved',
        savedRepoId: repo.id,
        savedVersionId: dbVersion.id,
      },
    })

    return NextResponse.json({
      repo: {
        id: repo.id,
        slug: repo.slug,
        displayName: repo.displayName,
        description: repo.description,
      },
      version: {
        id: dbVersion.id,
        commitSha: dbVersion.gitCommitSha,
      },
      suites: createdSuites,
    }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 }
    )
  }
}
