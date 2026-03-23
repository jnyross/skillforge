import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await prisma.reviewSession.findUnique({
    where: { id: params.id },
    include: {
      skillRepo: { select: { displayName: true } },
      comparisons: {
        include: { votes: true },
        orderBy: { order: 'asc' },
      },
      labels: {
        include: { critiques: true },
        orderBy: { createdAt: 'desc' },
      },
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
  const { status, completedPairs } = body

  const updated = await prisma.reviewSession.update({
    where: { id: params.id },
    data: {
      ...(status !== undefined && { status }),
      ...(completedPairs !== undefined && { completedPairs }),
      ...(status === 'completed' && { completedAt: new Date() }),
    },
  })

  return NextResponse.json(updated)
}
