import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/eval-builder/sessions/:id — get session with messages
 * PATCH /api/eval-builder/sessions/:id — update session (e.g., set skillRepoId)
 * DELETE /api/eval-builder/sessions/:id — delete session
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await prisma.evalBuilderSession.findUnique({
    where: { id },
    include: {
      skillRepo: { select: { id: true, displayName: true, slug: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json(session)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as {
    skillRepoId?: string
    title?: string
    corpusText?: string
  }

  const session = await prisma.evalBuilderSession.findUnique({ where: { id } })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const updated = await prisma.evalBuilderSession.update({
    where: { id },
    data: {
      ...(body.skillRepoId !== undefined ? { skillRepoId: body.skillRepoId } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.corpusText !== undefined ? {
        corpusText: session.corpusText
          ? session.corpusText + '\n\n---\n\n' + body.corpusText
          : body.corpusText,
      } : {}),
    },
    include: {
      skillRepo: { select: { id: true, displayName: true, slug: true } },
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.evalBuilderSession.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
