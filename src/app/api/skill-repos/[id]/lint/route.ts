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
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const { versionId } = body as { versionId?: string }

  // Get target version
  let version
  if (versionId) {
    version = await prisma.skillVersion.findUnique({ where: { id: versionId } })
  } else {
    version = await prisma.skillVersion.findFirst({
      where: { skillRepoId: params.id },
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
    return NextResponse.json({
      issues: [{
        severity: 'error',
        category: 'spec-correctness',
        rule: 'skill-md-exists',
        message: 'SKILL.md file is required but not found',
        file: 'SKILL.md',
        evidence: 'No SKILL.md file found',
      }],
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

  for (const issue of lintReport.issues) {
    await prisma.lintResult.create({
      data: {
        skillRepoId: params.id,
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

  return NextResponse.json(lintReport)
}
