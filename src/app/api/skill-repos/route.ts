import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { initSkillGitRepo, createVersion } from '@/lib/services/git-storage'
import { parseSkillMd, estimateTokenCount, countLines } from '@/lib/services/skill-parser'
import { lintSkill } from '@/lib/validators/skill-linter'
import type { SkillFile } from '@/types/skill'

/**
 * GET /api/skill-repos — List all skill repos
 */
export async function GET() {
  const repos = await prisma.skillRepo.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      versions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: {
        select: { versions: true },
      },
    },
  })

  return NextResponse.json(repos)
}

/**
 * POST /api/skill-repos — Create a new skill repo
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { slug, displayName, description, files } = body as {
    slug: string
    displayName: string
    description?: string
    files?: SkillFile[]
  }

  if (!slug || !displayName) {
    return NextResponse.json(
      { error: 'slug and displayName are required' },
      { status: 400 }
    )
  }

  // Validate slug format
  if (!/^[a-z0-9_-]+$/.test(slug)) {
    return NextResponse.json(
      { error: 'slug must contain only lowercase letters, numbers, hyphens, and underscores' },
      { status: 400 }
    )
  }

  // Check for duplicate slug
  const existing = await prisma.skillRepo.findUnique({ where: { slug } })
  if (existing) {
    return NextResponse.json(
      { error: `A skill repo with slug "${slug}" already exists` },
      { status: 409 }
    )
  }

  // Create the repo
  const repo = await prisma.skillRepo.create({
    data: {
      slug,
      displayName,
      description: description || '',
      gitRepoPath: '', // Will be set after git init
    },
  })

  // Initialize git repo
  const gitRepoPath = await initSkillGitRepo(repo.id)

  // Update with git path
  await prisma.skillRepo.update({
    where: { id: repo.id },
    data: { gitRepoPath },
  })

  // If files are provided, create initial version
  if (files && files.length > 0) {
    const skillMdFile = files.find(f => f.path === 'SKILL.md')
    const parsedSkill = skillMdFile ? parseSkillMd(skillMdFile.content) : null

    const commitSha = await createVersion(
      gitRepoPath,
      files,
      'Initial version'
    )

    const totalContent = files.map(f => f.content).join('\n')

    const version = await prisma.skillVersion.create({
      data: {
        skillRepoId: repo.id,
        branchName: 'main',
        gitCommitSha: commitSha,
        commitMessage: 'Initial version',
        tokenCount: estimateTokenCount(totalContent),
        lineCount: countLines(totalContent),
        fileCount: files.length,
        isChampion: true,
      },
    })

    // Update champion
    await prisma.skillRepo.update({
      where: { id: repo.id },
      data: { currentChampionVersionId: version.id },
    })

    // Run linting if SKILL.md exists
    if (parsedSkill) {
      const lintReport = lintSkill(parsedSkill, files, slug)
      for (const issue of lintReport.issues) {
        await prisma.lintResult.create({
          data: {
            skillRepoId: repo.id,
            skillVersionId: version.id,
            severity: issue.severity,
            category: issue.category,
            rule: issue.rule,
            message: issue.message,
            file: issue.file,
            line: issue.line,
            evidence: issue.evidence,
          },
        })
      }
    }
  }

  const createdRepo = await prisma.skillRepo.findUnique({
    where: { id: repo.id },
    include: {
      versions: true,
      lintResults: true,
    },
  })

  return NextResponse.json(createdRepo, { status: 201 })
}
