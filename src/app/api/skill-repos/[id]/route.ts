import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteSkillGitRepo } from '@/lib/services/git-storage'

/**
 * GET /api/skill-repos/:id — Get a skill repo by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const repo = await prisma.skillRepo.findUnique({
    where: { id: params.id },
    include: {
      versions: {
        orderBy: { createdAt: 'desc' },
      },
      lintResults: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const { gitRepoPath: _gitRepoPath, ...repoDto } = repo
  return NextResponse.json(repoDto)
}

/**
 * PATCH /api/skill-repos/:id — Update a skill repo
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { displayName, description } = body as {
    displayName?: string
    description?: string
  }

  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const updated = await prisma.skillRepo.update({
    where: { id: params.id },
    data: {
      ...(displayName && { displayName }),
      ...(description !== undefined && { description }),
    },
  })

  const { gitRepoPath: _gitRepoPath, ...updatedDto } = updated
  return NextResponse.json(updatedDto)
}

/**
 * DELETE /api/skill-repos/:id — Delete a skill repo
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  // Delete from database first (cascades to versions and lint results)
  await prisma.skillRepo.delete({ where: { id: params.id } })

  // Then clean up git repo on disk
  try {
    await deleteSkillGitRepo(repo.id)
  } catch (err) {
    console.error('Failed to delete git repo from disk:', err)
  }

  return NextResponse.json({ success: true })
}
