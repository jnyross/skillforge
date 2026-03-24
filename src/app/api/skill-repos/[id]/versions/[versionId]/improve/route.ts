import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runIteration } from '@/lib/services/improvement/iteration-runner'
import type { ExecutorConfig } from '@/lib/services/executor/types'

/**
 * GET /api/skill-repos/[id]/versions/[versionId]/improve
 * Returns all improvement iterations for this version.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id: skillRepoId, versionId } = await params

  const iterations = await prisma.improvementIteration.findMany({
    where: { skillRepoId, sourceVersionId: versionId },
    orderBy: { iterationNumber: 'asc' },
  })

  return NextResponse.json({
    iterations: iterations.map(it => ({
      ...it,
      analysisJson: JSON.parse(it.analysisJson || '{}'),
      suggestionsJson: JSON.parse(it.suggestionsJson || '[]'),
      acceptedIndices: JSON.parse(it.acceptedIndices || '[]'),
    })),
  })
}

/**
 * POST /api/skill-repos/[id]/versions/[versionId]/improve
 * Starts one improvement iteration.
 * Requires evalSuiteId in the request body.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id: skillRepoId, versionId } = await params

  const body = await request.json() as {
    evalSuiteId?: string
    model?: string
    effort?: string
    maxTurns?: number
  }

  if (!body.evalSuiteId) {
    return NextResponse.json(
      { error: 'evalSuiteId is required' },
      { status: 400 }
    )
  }

  // Verify repo and version exist
  const skillRepo = await prisma.skillRepo.findUnique({
    where: { id: skillRepoId },
  })
  if (!skillRepo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const version = await prisma.skillVersion.findUnique({
    where: { id: versionId },
  })
  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  // Verify eval suite exists
  const suite = await prisma.evalSuite.findUnique({
    where: { id: body.evalSuiteId },
  })
  if (!suite) {
    return NextResponse.json({ error: 'Eval suite not found' }, { status: 404 })
  }

  // Check no iteration is already running for this version
  const runningIteration = await prisma.improvementIteration.findFirst({
    where: {
      skillRepoId,
      sourceVersionId: versionId,
      status: { in: ['pending', 'running', 'analyzing'] },
    },
  })
  if (runningIteration) {
    return NextResponse.json(
      { error: 'An iteration is already in progress for this version' },
      { status: 409 }
    )
  }

  const executorConfig: ExecutorConfig = {
    model: body.model || 'claude-opus-4-6',
    effort: (body.effort as ExecutorConfig['effort']) || 'high',
    maxTurns: body.maxTurns || 10,
    permissionMode: 'auto',
  }

  // Run iteration asynchronously — respond immediately with the iteration ID
  // We create the iteration first, then run it in the background
  const latestIteration = await prisma.improvementIteration.findFirst({
    where: { skillRepoId, sourceVersionId: versionId },
    orderBy: { iterationNumber: 'desc' },
    select: { iterationNumber: true },
  })

  const iterationNumber = (latestIteration?.iterationNumber ?? 0) + 1

  const iteration = await prisma.improvementIteration.create({
    data: {
      skillRepoId,
      sourceVersionId: versionId,
      iterationNumber,
      status: 'running',
    },
  })

  // Run iteration in the background (don't await)
  runIterationInBackground(iteration.id, {
    skillRepoId,
    skillVersionId: versionId,
    evalSuiteId: body.evalSuiteId,
    executorConfig,
  })

  return NextResponse.json(
    {
      iterationId: iteration.id,
      iterationNumber,
      status: 'running',
      message: 'Improvement iteration started. Poll GET to check progress.',
    },
    { status: 202 }
  )
}

/**
 * Run an iteration in the background, updating the pre-created record.
 */
async function runIterationInBackground(
  iterationId: string,
  input: {
    skillRepoId: string
    skillVersionId: string
    evalSuiteId: string
    executorConfig: ExecutorConfig
  }
) {
  try {
    const result = await runIteration(input)

    // Update the pre-created iteration with results
    await prisma.improvementIteration.update({
      where: { id: iterationId },
      data: {
        status: result.status,
        passRate: result.passRate,
        skillWinRate: result.skillWinRate,
        avgDelta: result.avgDelta,
        analysisJson: result.analysis ? JSON.stringify(result.analysis) : '{}',
        suggestionsJson: result.analysis
          ? JSON.stringify(result.analysis.improvement_suggestions)
          : '[]',
        completedAt: new Date(),
        error: result.error || null,
      },
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await prisma.improvementIteration.update({
      where: { id: iterationId },
      data: {
        status: 'failed',
        error: errorMsg,
        completedAt: new Date(),
      },
    })
  }
}
