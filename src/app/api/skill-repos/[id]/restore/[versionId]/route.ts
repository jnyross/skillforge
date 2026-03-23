import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { restoreVersion, getFilesAtCommit } from '@/lib/services/git-storage'
import { parseSkillMd, estimateTokenCount, countLines } from '@/lib/services/skill-parser'
import { lintSkill } from '@/lib/validators/skill-linter'

/**
 * POST /api/skill-repos/:id/restore/:versionId — Restore an old version
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const targetVersion = await prisma.skillVersion.findUnique({
    where: { id: params.versionId },
  })
  if (!targetVersion) {
    return NextResponse.json({ error: 'Target version not found' }, { status: 404 })
  }

  // Find current latest version as parent
  const latestVersion = await prisma.skillVersion.findFirst({
    where: { skillRepoId: params.id, branchName: repo.defaultBranch },
    orderBy: { createdAt: 'desc' },
  })

  // Create a new commit that restores the target version's files
  const newCommitSha = await restoreVersion(
    repo.gitRepoPath,
    targetVersion.gitCommitSha,
    repo.defaultBranch
  )

  // Get the restored files
  const files = await getFilesAtCommit(repo.gitRepoPath, newCommitSha)
  const totalContent = files.map(f => f.content).join('\n')

  // Create new version record
  const version = await prisma.skillVersion.create({
    data: {
      skillRepoId: params.id,
      branchName: repo.defaultBranch,
      gitCommitSha: newCommitSha,
      parentVersionId: latestVersion?.id || null,
      commitMessage: `Restore version ${targetVersion.gitCommitSha.slice(0, 8)}`,
      tokenCount: estimateTokenCount(totalContent),
      lineCount: countLines(totalContent),
      fileCount: files.length,
    },
  })

  // Run linting
  const skillMdFile = files.find(f => f.path === 'SKILL.md')
  if (skillMdFile) {
    const parsedSkill = parseSkillMd(skillMdFile.content)
    const lintReport = lintSkill(parsedSkill, files, repo.slug)

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
  }

  return NextResponse.json(version, { status: 201 })
}
