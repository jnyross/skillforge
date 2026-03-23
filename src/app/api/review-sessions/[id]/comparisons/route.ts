import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await prisma.reviewSession.findUnique({ where: { id: params.id } })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const comparisons = await prisma.pairwiseComparison.findMany({
    where: { reviewSessionId: params.id },
    include: { votes: true },
    orderBy: { order: 'asc' },
  })

  return NextResponse.json(comparisons)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { pairs } = body

  if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
    return NextResponse.json(
      { error: 'pairs array is required' },
      { status: 400 }
    )
  }

  const session = await prisma.reviewSession.findUnique({ where: { id: params.id } })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (session.status !== 'active') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 400 })
  }

  // Validate all pairs have required fields
  for (const pair of pairs) {
    if (!pair.evalCaseRunIdA || !pair.evalCaseRunIdB || !pair.versionIdA || !pair.versionIdB) {
      return NextResponse.json(
        { error: 'Each pair must have evalCaseRunIdA, evalCaseRunIdB, versionIdA, versionIdB' },
        { status: 400 }
      )
    }
  }

  const comparisons = await prisma.$transaction(
    pairs.map((pair: { evalCaseRunIdA: string; evalCaseRunIdB: string; versionIdA: string; versionIdB: string }, index: number) =>
      prisma.pairwiseComparison.create({
        data: {
          reviewSessionId: params.id,
          evalCaseRunIdA: pair.evalCaseRunIdA,
          evalCaseRunIdB: pair.evalCaseRunIdB,
          versionIdA: pair.versionIdA,
          versionIdB: pair.versionIdB,
          order: index,
        },
      })
    )
  )

  // Update total pairs count
  await prisma.reviewSession.update({
    where: { id: params.id },
    data: { totalPairs: { increment: comparisons.length } },
  })

  return NextResponse.json(comparisons, { status: 201 })
}
