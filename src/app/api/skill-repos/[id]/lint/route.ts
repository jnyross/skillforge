import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFilesAtCommit } from '@/lib/services/git-storage'
import { parseSkillMd } from '@/lib/services/skill-parser'
import { lintSkill } from '@/lib/validators/skill-linter'

/**
 * POST /api/skill-repos/:id/lint — Run linter on latest or specified version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id

  const repo = await prisma.skillRepo.findUnique({ where: { id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const { versionId } = body as { versionId?: string }

  // Get target version
  let version
  if (versionId) {
    version = await prisma.skillVersion.findUnique({ where: { id: versionId, skillRepoId: id } })
  } else {
    version = await prisma.skillVersion.findFirst({
      where: { skillRepoId: id },
      orderBy: { createdAt: 'desc' },
    })
  }

  if (!version) {
    return NextResponse.json({ error: 'No version found to lint' }, { status: 404 })
  }

  // Get files from git
  const files = await getFilesAtCommit(repo.gitRepoPath, version.gitCommitSha)

  // Find and parse SKILL.md
  const skillMdFile = files.find(f => f.path === 'SKILL.md')
  if (!skillMdFile) {
    const missingIssue = {
      severity: 'error' as const,
      category: 'spec-correctness',
      rule: 'skill-md-exists',
      message: 'SKILL.md file is required but not found',
      file: 'SKILL.md',
      evidence: 'No SKILL.md file found',
    }

    // Persist the missing-SKILL.md lint result
    await prisma.lintResult.deleteMany({ where: { skillVersionId: version.id } })
    await prisma.lintResult.create({
      data: {
        skillRepoId: id,
        skillVersionId: version.id,
        severity: missingIssue.severity,
        category: missingIssue.category,
        rule: missingIssue.rule,
        message: missingIssue.message,
        file: missingIssue.file,
        evidence: missingIssue.evidence,
      },
    })

    return NextResponse.json({
      issues: [missingIssue],
      scorecard: [],
      passed: false,
      errorCount: 1,
      warningCount: 0,
      infoCount: 0,
    })
  }

  const parsedSkill = parseSkillMd(skillMdFile.content)
  const lintReport = lintSkill(parsedSkill, files, repo.slug)

  // Persist lint results
  await prisma.lintResult.deleteMany({
    where: { skillVersionId: version.id },
  })

  if (lintReport.issues.length > 0) {
    await prisma.lintResult.createMany({
      data: lintReport.issues.map(issue => ({
        skillRepoId: id,
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

  return NextResponse.json(lintReport)
}
