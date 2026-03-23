import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Promote a trace to a regression test case.
 * Creates a new eval case in a regression suite for the same skill repo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const trace = await prisma.trace.findUnique({
    where: { id: params.id },
    include: {
      evalRun: {
        select: { skillRepoId: true, suiteId: true },
      },
      caseRuns: {
        include: { evalCase: true },
        take: 1,
      },
      logChunks: { where: { stream: 'stdout' }, take: 1 },
    },
  })

  if (!trace) {
    return NextResponse.json({ error: 'Trace not found' }, { status: 404 })
  }

  if (!trace.evalRun) {
    return NextResponse.json(
      { error: 'Trace is not associated with an eval run' },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const caseName = body.name || `Regression from trace ${params.id.slice(0, 8)}`
  const caseKey = body.key || `regression-${params.id.slice(0, 8)}-${Date.now()}`

  // Find or create a regression suite for this repo
  let regressionSuite = await prisma.evalSuite.findFirst({
    where: {
      skillRepoId: trace.evalRun.skillRepoId,
      type: 'regression',
    },
  })

  if (!regressionSuite) {
    regressionSuite = await prisma.evalSuite.create({
      data: {
        skillRepoId: trace.evalRun.skillRepoId,
        name: 'Auto Regression Suite',
        type: 'regression',
        description: 'Automatically created from promoted traces',
      },
    })
  }

  // Get the original prompt from the case run or trace
  const originalCase = trace.caseRuns[0]?.evalCase
  const prompt = originalCase?.prompt || trace.prompt || ''
  const expectedOutcome = trace.logChunks[0]?.content?.slice(0, 1000) || ''

  const newCase = await prisma.evalCase.create({
    data: {
      evalSuiteId: regressionSuite.id,
      key: caseKey,
      name: caseName,
      prompt,
      expectedOutcome,
      split: 'validation',
      tags: 'regression,promoted',
    },
  })

  return NextResponse.json({
    case: newCase,
    suite: { id: regressionSuite.id, name: regressionSuite.name },
  }, { status: 201 })
}
