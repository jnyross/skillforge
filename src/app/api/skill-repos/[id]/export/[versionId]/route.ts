import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFilesAtCommit } from '@/lib/services/git-storage'

/**
 * GET /api/skill-repos/:id/export/:versionId — Export a version's files
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const version = await prisma.skillVersion.findUnique({
    where: { id: params.versionId },
  })
  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  const files = await getFilesAtCommit(repo.gitRepoPath, version.gitCommitSha)

  return NextResponse.json({
    repo: {
      slug: repo.slug,
      displayName: repo.displayName,
    },
    version: {
      id: version.id,
      commitSha: version.gitCommitSha,
      message: version.commitMessage,
      createdAt: version.createdAt,
    },
    files,
  })
}
