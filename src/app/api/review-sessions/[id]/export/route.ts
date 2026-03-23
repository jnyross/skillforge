import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await prisma.reviewSession.findUnique({
    where: { id: params.id },
    include: {
      skillRepo: { select: { displayName: true, slug: true } },
      comparisons: {
        include: { votes: true },
        orderBy: { order: 'asc' },
      },
      labels: {
        include: { critiques: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const exportData = {
    session: {
      id: session.id,
      name: session.name,
      type: session.type,
      reviewer: session.reviewer,
      status: session.status,
      totalPairs: session.totalPairs,
      completedPairs: session.completedPairs,
      skillRepo: session.skillRepo,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
    },
    comparisons: session.comparisons.map(c => ({
      id: c.id,
      evalCaseRunIdA: c.evalCaseRunIdA,
      evalCaseRunIdB: c.evalCaseRunIdB,
      versionIdA: c.versionIdA,
      versionIdB: c.versionIdB,
      order: c.order,
      votes: c.votes.map(v => ({
        selectedWinner: v.selectedWinner,
        confidence: v.confidence,
        durationMs: v.durationMs,
        createdAt: v.createdAt,
      })),
    })),
    labels: session.labels.map(l => ({
      id: l.id,
      evalCaseRunId: l.evalCaseRunId,
      label: l.label,
      confidence: l.confidence,
      createdAt: l.createdAt,
      critiques: l.critiques.map(c => ({
        content: c.content,
        category: c.category,
        severity: c.severity,
      })),
    })),
    summary: {
      totalComparisons: session.comparisons.length,
      totalVotes: session.comparisons.reduce((sum, c) => sum + c.votes.length, 0),
      totalLabels: session.labels.length,
      totalCritiques: session.labels.reduce((sum, l) => sum + l.critiques.length, 0),
      passCount: session.labels.filter(l => l.label === 'pass').length,
      failCount: session.labels.filter(l => l.label === 'fail').length,
      winnerDistribution: {
        A: session.comparisons.reduce((sum, c) => sum + c.votes.filter(v => v.selectedWinner === 'A').length, 0),
        B: session.comparisons.reduce((sum, c) => sum + c.votes.filter(v => v.selectedWinner === 'B').length, 0),
        tie: session.comparisons.reduce((sum, c) => sum + c.votes.filter(v => v.selectedWinner === 'tie').length, 0),
        'both-bad': session.comparisons.reduce((sum, c) => sum + c.votes.filter(v => v.selectedWinner === 'both-bad').length, 0),
      },
    },
  }

  return NextResponse.json(exportData)
}
