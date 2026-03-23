import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listBranches, createBranch } from '@/lib/services/git-storage'

/**
 * GET /api/skill-repos/:id/branches — List branches
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const branches = await listBranches(repo.gitRepoPath)
  return NextResponse.json({ branches, defaultBranch: repo.defaultBranch })
}

/**
 * POST /api/skill-repos/:id/branches — Create a branch
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
  const { name, fromVersionId } = body as {
    name: string
    fromVersionId?: string
  }

  if (!name) {
    return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
  }

  let fromCommit: string | undefined
  if (fromVersionId) {
    const version = await prisma.skillVersion.findUnique({
      where: { id: fromVersionId, skillRepoId: params.id },
    })
    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 })
    }
    fromCommit = version.gitCommitSha
  }

  await createBranch(repo.gitRepoPath, name, fromCommit)

  return NextResponse.json({ success: true, branch: name }, { status: 201 })
}
