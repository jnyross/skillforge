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

  return NextResponse.json(repo)
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

  return NextResponse.json(updated)
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

  // Delete git repo
  await deleteSkillGitRepo(repo.id)

  // Delete from database (cascades to versions and lint results)
  await prisma.skillRepo.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
