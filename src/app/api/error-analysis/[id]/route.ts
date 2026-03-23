import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await prisma.errorAnalysisSession.findUnique({
    where: { id: params.id },
    include: {
      skillRepo: { select: { id: true, displayName: true } },
      _count: { select: { traces: true, categories: true } },
    },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json(session)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { status } = body

  const existing = await prisma.errorAnalysisSession.findUnique({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const updated = await prisma.errorAnalysisSession.update({
    where: { id: params.id },
    data: { ...(status !== undefined && { status }) },
  })

  return NextResponse.json(updated)
}
