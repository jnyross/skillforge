import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const skillRepoId = searchParams.get('skillRepoId')

  const where = skillRepoId ? { skillRepoId } : {}

  const sessions = await prisma.reviewSession.findMany({
    where,
    include: {
      skillRepo: { select: { displayName: true, slug: true } },
      _count: { select: { comparisons: true, labels: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(sessions)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { skillRepoId, name, type, reviewer, configJson } = body

  if (!skillRepoId || !name || !type) {
    return NextResponse.json(
      { error: 'skillRepoId, name, and type are required' },
      { status: 400 }
    )
  }

  const validTypes = ['blind-ab', 'pass-fail']
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    )
  }

  const session = await prisma.reviewSession.create({
    data: {
      skillRepoId,
      name,
      type,
      reviewer: reviewer || 'user',
      configJson: configJson ? JSON.stringify(configJson) : '{}',
    },
  })

  return NextResponse.json(session, { status: 201 })
}
