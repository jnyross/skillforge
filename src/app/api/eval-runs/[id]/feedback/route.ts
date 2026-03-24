import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/eval-runs/[id]/feedback
 * Returns all human feedback for case runs in this eval run.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: evalRunId } = await params

  const caseRuns = await prisma.evalCaseRun.findMany({
    where: { evalRunId },
    select: {
      id: true,
      feedbackJson: true,
      evalCase: { select: { id: true, name: true, key: true } },
    },
  })

  const feedback = caseRuns
    .map(cr => ({
      caseRunId: cr.id,
      caseId: cr.evalCase.id,
      caseName: cr.evalCase.name,
      caseKey: cr.evalCase.key,
      feedback: JSON.parse(cr.feedbackJson || '{}') as { rating?: string; comment?: string },
    }))
    .filter(f => f.feedback.rating || f.feedback.comment)

  return NextResponse.json({ feedback })
}

/**
 * POST /api/eval-runs/[id]/feedback
 * Save feedback for a specific case run.
 * Body: { caseRunId: string, rating?: 'good' | 'bad' | null, comment?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: evalRunId } = await params

  const body = await request.json() as {
    caseRunId?: string
    rating?: 'good' | 'bad' | null
    comment?: string
  }

  if (!body.caseRunId) {
    return NextResponse.json({ error: 'caseRunId is required' }, { status: 400 })
  }

  // Verify case run belongs to this eval run
  const caseRun = await prisma.evalCaseRun.findFirst({
    where: { id: body.caseRunId, evalRunId },
  })

  if (!caseRun) {
    return NextResponse.json({ error: 'Case run not found in this eval run' }, { status: 404 })
  }

  const feedbackData = {
    rating: body.rating ?? null,
    comment: body.comment ?? '',
  }

  await prisma.evalCaseRun.update({
    where: { id: body.caseRunId },
    data: { feedbackJson: JSON.stringify(feedbackData) },
  })

  return NextResponse.json({ success: true, feedback: feedbackData })
}
