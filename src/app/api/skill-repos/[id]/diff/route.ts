import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { diffVersions } from '@/lib/services/git-storage'

/**
 * GET /api/skill-repos/:id/diff?from=...&to=... — Diff two versions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const searchParams = request.nextUrl.searchParams
  const fromVersionId = searchParams.get('from')
  const toVersionId = searchParams.get('to')

  if (!fromVersionId || !toVersionId) {
    return NextResponse.json(
      { error: 'from and to version IDs are required' },
      { status: 400 }
    )
  }

  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const fromVersion = await prisma.skillVersion.findUnique({
    where: { id: fromVersionId },
  })
  const toVersion = await prisma.skillVersion.findUnique({
    where: { id: toVersionId },
  })

  if (!fromVersion || !toVersion) {
    return NextResponse.json({ error: 'One or both versions not found' }, { status: 404 })
  }

  const diff = await diffVersions(
    repo.gitRepoPath,
    fromVersion.gitCommitSha,
    toVersion.gitCommitSha
  )

  return NextResponse.json({
    from: fromVersion,
    to: toVersion,
    diff,
  })
}
