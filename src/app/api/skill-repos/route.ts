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

  // Fetch lint results only for the latest version of each repo
  const latestVersionIds = repos
    .map(r => r.versions[0]?.id)
    .filter((id): id is string => !!id)

  const lintResults = latestVersionIds.length > 0
    ? await prisma.lintResult.findMany({
        where: { skillVersionId: { in: latestVersionIds } },
        select: { skillVersionId: true, severity: true },
      })
    : []

  const lintByVersion = new Map<string, Array<{ severity: string }>>()
  for (const lr of lintResults) {
    if (!lr.skillVersionId) continue
    const existing = lintByVersion.get(lr.skillVersionId) || []
    existing.push({ severity: lr.severity })
    lintByVersion.set(lr.skillVersionId, existing)
  }

  // Fetch failing suite counts and active optimizer counts per repo
  const repoIds = repos.map(r => r.id)

  const [failingSuites, activeOptimizers] = await Promise.all([
    prisma.evalRun.groupBy({
      by: ['skillRepoId'],
      where: {
        skillRepoId: { in: repoIds },
        status: 'completed',
      },
      _count: true,
    }).then(async (runs) => {
      // Find runs with passRate < 1.0 (failing)
      const failingCounts = new Map<string, number>()
      for (const r of runs) {
        // Count unique suites with at least one failing run
        const failingRuns = await prisma.evalRun.findMany({
          where: {
            skillRepoId: r.skillRepoId,
            status: 'completed',
          },
          select: { suiteId: true, metricsJson: true },
        })
        const failingSuiteIds = new Set<string>()
        for (const run of failingRuns) {
          try {
            const metrics = JSON.parse(run.metricsJson || '{}')
            if (metrics.passRate !== undefined && metrics.passRate < 1.0) {
              failingSuiteIds.add(run.suiteId)
            }
          } catch { /* ignore */ }
        }
        failingCounts.set(r.skillRepoId, failingSuiteIds.size)
      }
      return failingCounts
    }),
    prisma.optimizerRun.groupBy({
      by: ['skillRepoId'],
      where: {
        skillRepoId: { in: repoIds },
        status: { in: ['queued', 'running'] },
      },
      _count: true,
    }).then(results => {
      const map = new Map<string, number>()
      for (const r of results) {
        map.set(r.skillRepoId, r._count)
      }
      return map
    }),
  ])

  const reposDto = repos.map(({ gitRepoPath: _g, ...rest }) => ({
    ...rest,
    lintResults: lintByVersion.get(rest.versions[0]?.id) || [],
    failingSuiteCount: failingSuites.get(rest.id) || 0,
    activeOptimizerCount: activeOptimizers.get(rest.id) || 0,
  }))
  return NextResponse.json(reposDto)
}

/**
 * POST /api/skill-repos — Create a new skill repo
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { slug, displayName, description, files } = body as {
    slug: string
    displayName: string
    description?: string
    files?: SkillFile[]
  }

  if (!slug || typeof slug !== 'string' || !displayName || typeof displayName !== 'string') {
    return NextResponse.json(
      { error: 'slug and displayName are required strings' },
      { status: 400 }
    )
  }

  if (files !== undefined && !Array.isArray(files)) {
    return NextResponse.json(
      { error: 'files must be an array if provided' },
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
  let repo
  try {
    repo = await prisma.skillRepo.create({
      data: {
        slug,
        displayName,
        description: description || '',
        gitRepoPath: '', // Will be set after git init
      },
    })
  } catch (err) {
    // Handle unique constraint violation (race condition on slug)
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: `A skill repo with slug "${slug}" already exists` },
        { status: 409 }
      )
    }
    throw err
  }

  try {
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
        if (lintReport.issues.length > 0) {
          await prisma.lintResult.createMany({
            data: lintReport.issues.map(issue => ({
              skillRepoId: repo.id,
              skillVersionId: version.id,
              severity: issue.severity,
              category: issue.category,
              rule: issue.rule,
              message: issue.message,
              file: issue.file,
              line: issue.line,
              evidence: issue.evidence,
            })),
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

    const { gitRepoPath: _g, ...createdRepoDto } = createdRepo!
    return NextResponse.json(createdRepoDto, { status: 201 })
  } catch (err) {
    // Compensation: clean up partially created repo
    try {
      const { deleteSkillGitRepo } = await import('@/lib/services/git-storage')
      await deleteSkillGitRepo(repo.id)
    } catch { /* ignore cleanup errors */ }
    try {
      await prisma.skillRepo.delete({ where: { id: repo.id } })
    } catch { /* ignore cleanup errors */ }
    throw err
  }
}
