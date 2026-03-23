import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { comparisonId, selectedWinner, confidence, durationMs } = body

  if (!comparisonId || !selectedWinner) {
    return NextResponse.json(
      { error: 'comparisonId and selectedWinner are required' },
      { status: 400 }
    )
  }

  const validWinners = ['A', 'B', 'tie', 'both-bad']
  if (!validWinners.includes(selectedWinner)) {
    return NextResponse.json(
      { error: `selectedWinner must be one of: ${validWinners.join(', ')}` },
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

  const comparison = await prisma.pairwiseComparison.findUnique({
    where: { id: comparisonId },
  })
  if (!comparison || comparison.reviewSessionId !== params.id) {
    return NextResponse.json({ error: 'Comparison not found' }, { status: 404 })
  }

  const vote = await prisma.preferenceVote.create({
    data: {
      comparisonId,
      selectedWinner,
      confidence: confidence ?? 0.5,
      durationMs: durationMs ?? null,
    },
  })

  await prisma.reviewSession.update({
    where: { id: params.id },
    data: { completedPairs: { increment: 1 } },
  })

  return NextResponse.json(vote, { status: 201 })
}
