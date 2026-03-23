import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createVersion, getFilesAtCommit } from '@/lib/services/git-storage'
import { parseSkillMd, estimateTokenCount, countLines } from '@/lib/services/skill-parser'
import { lintSkill } from '@/lib/validators/skill-linter'
import type { SkillFile } from '@/types/skill'

/**
 * GET /api/skill-repos/:id/versions — List versions
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const versions = await prisma.skillVersion.findMany({
    where: { skillRepoId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(versions)
}

/**
 * POST /api/skill-repos/:id/versions — Create a new version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { files, message, branchName, isChampion, notes } = body as {
    files: SkillFile[]
    message: string
    branchName?: string
    isChampion?: boolean
    notes?: string
  }

  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'files must be a non-empty array' }, { status: 400 })
  }

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message is required and must be a string' }, { status: 400 })
  }

  const branch = branchName || repo.defaultBranch

  // Find parent version
  const parentVersion = await prisma.skillVersion.findFirst({
    where: { skillRepoId: params.id, branchName: branch },
    orderBy: { createdAt: 'desc' },
  })

  // Capture current HEAD for compensation on failure
  const git = (await import('@/lib/services/git-storage')).getGit(repo.gitRepoPath)
  let previousHead: string | undefined
  try {
    previousHead = (await git.revparse(['HEAD'])).trim()
  } catch {
    // No commits yet
  }

  // Create git commit
  const commitSha = await createVersion(
    repo.gitRepoPath,
    files,
    message,
    branch
  )

  const totalContent = files.map(f => f.content).join('\n')

  try {
    // Create version record
    const version = await prisma.skillVersion.create({
      data: {
        skillRepoId: params.id,
        branchName: branch,
        gitCommitSha: commitSha,
        parentVersionId: parentVersion?.id || null,
        commitMessage: message,
        tokenCount: estimateTokenCount(totalContent),
        lineCount: countLines(totalContent),
        fileCount: files.length,
        isChampion: isChampion || false,
        notes: notes || '',
      },
    })

    // If marked as champion, update repo
    if (isChampion) {
      // Unmark previous champion
      await prisma.skillVersion.updateMany({
        where: {
          skillRepoId: params.id,
          isChampion: true,
          id: { not: version.id },
        },
        data: { isChampion: false },
      })

      await prisma.skillRepo.update({
        where: { id: params.id },
        data: { currentChampionVersionId: version.id },
      })
    }

    // Run linting
    const skillMdFile = files.find(f => f.path === 'SKILL.md')
    if (skillMdFile) {
      const parsedSkill = parseSkillMd(skillMdFile.content)
      const lintReport = lintSkill(parsedSkill, files, repo.slug)

      if (lintReport.issues.length > 0) {
        await prisma.lintResult.createMany({
          data: lintReport.issues.map(issue => ({
            skillRepoId: params.id,
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

    return NextResponse.json(version, { status: 201 })
  } catch (err) {
    // Compensate: reset git branch to previous HEAD
    if (previousHead) {
      try {
        await git.reset(['--hard', previousHead])
      } catch (resetErr) {
        console.error('Failed to reset git HEAD after DB error:', resetErr)
      }
    }
    throw err
  }
}
