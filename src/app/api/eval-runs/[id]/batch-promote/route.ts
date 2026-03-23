import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '@/lib/services/audit-log'

/**
 * Batch promote failed traces from an eval run to eval cases.
 * Takes failed case runs and creates new eval cases from them.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { caseRunIds, targetSuiteId } = body

  if (!caseRunIds || !Array.isArray(caseRunIds) || caseRunIds.length === 0) {
    return NextResponse.json({ error: 'caseRunIds array is required' }, { status: 400 })
  }

  const run = await prisma.evalRun.findUnique({
    where: { id: params.id },
    select: { suiteId: true },
  })
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  const suiteId = targetSuiteId || run.suiteId

  const caseRuns = await prisma.evalCaseRun.findMany({
    where: {
      id: { in: caseRunIds },
      evalRunId: params.id,
      status: 'failed',
    },
    include: {
      evalCase: true,
      trace: { select: { prompt: true } },
    },
  })

  if (caseRuns.length === 0) {
    return NextResponse.json({ error: 'No failed case runs found matching the provided IDs' }, { status: 400 })
  }

  const suite = await prisma.evalSuite.findUnique({ where: { id: suiteId } })
  if (!suite) {
    return NextResponse.json({ error: 'Target suite not found' }, { status: 404 })
  }
  if (suite.frozen) {
    return NextResponse.json({ error: 'Target suite is frozen' }, { status: 400 })
  }

  const created = []
  for (const cr of caseRuns) {
    const existingCase = await prisma.evalCase.findUnique({
      where: { evalSuiteId_key: { evalSuiteId: suiteId, key: `promoted-${cr.id.slice(0, 8)}` } },
    })
    if (existingCase) continue

    const newCase = await prisma.evalCase.create({
      data: {
        evalSuiteId: suiteId,
        key: `promoted-${cr.id.slice(0, 8)}`,
        name: `[Promoted] ${cr.evalCase.name}`,
        prompt: cr.trace?.prompt || cr.evalCase.prompt,
        shouldTrigger: cr.evalCase.shouldTrigger,
        expectedOutcome: cr.evalCase.expectedOutcome,
        split: 'train',
        tags: cr.evalCase.tags ? `${cr.evalCase.tags},promoted` : 'promoted',
        source: 'promoted-trace',
      },
    })
    created.push(newCase)
  }

  await logAuditEvent({
    action: 'eval_cases.batch_promoted',
    entityType: 'eval_run',
    entityId: params.id,
    details: { count: created.length, targetSuiteId: suiteId },
  })

  return NextResponse.json({ promoted: created.length, cases: created }, { status: 201 })
}
