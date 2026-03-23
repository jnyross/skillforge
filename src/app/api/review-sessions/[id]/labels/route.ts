import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { evalCaseRunId, label, confidence, critiques } = body

  if (!evalCaseRunId || !label) {
    return NextResponse.json(
      { error: 'evalCaseRunId and label are required' },
      { status: 400 }
    )
  }

  const reviewLabel = await prisma.reviewLabel.create({
    data: {
      reviewSessionId: params.id,
      evalCaseRunId,
      label,
      confidence: confidence ?? 0.5,
      critiques: critiques ? {
        create: critiques.map((c: { content: string; category?: string; severity?: string }) => ({
          content: c.content,
          category: c.category || '',
          severity: c.severity || 'minor',
        })),
      } : undefined,
    },
    include: { critiques: true },
  })

  // Update completed count
  await prisma.reviewSession.update({
    where: { id: params.id },
    data: { completedPairs: { increment: 1 } },
  })

  return NextResponse.json(reviewLabel, { status: 201 })
}
