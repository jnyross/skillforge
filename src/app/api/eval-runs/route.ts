import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '@/lib/services/audit-log'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const skillRepoId = searchParams.get('skillRepoId')
  const skillVersionId = searchParams.get('skillVersionId')
  const suiteId = searchParams.get('suiteId')
  const status = searchParams.get('status')

  const where: Record<string, string> = {}
  if (skillRepoId) where.skillRepoId = skillRepoId
  if (skillVersionId) where.skillVersionId = skillVersionId
  if (suiteId) where.suiteId = suiteId
  if (status) where.status = status

  const runs = await prisma.evalRun.findMany({
    where,
    include: {
      skillVersion: { select: { id: true, commitMessage: true, gitCommitSha: true } },
      baselineVersion: { select: { id: true, commitMessage: true, gitCommitSha: true } },
      suite: { select: { id: true, name: true, type: true } },
      _count: { select: { caseRuns: true, traces: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(runs)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    skillRepoId, skillVersionId, baselineVersionId, suiteId,
    executorType, model, effort, permissionMode, maxTurns, splitFilter,
  } = body

  if (!skillRepoId || !skillVersionId || !suiteId) {
    return NextResponse.json(
      { error: 'skillRepoId, skillVersionId, and suiteId are required' },
      { status: 400 }
    )
  }

  const run = await prisma.evalRun.create({
    data: {
      skillRepoId,
      skillVersionId,
      baselineVersionId: baselineVersionId || null,
      suiteId,
      executorType: executorType || 'claude-cli',
      model: model || 'claude-opus-4-6',
      effort: effort || 'medium',
      permissionMode: permissionMode || 'default',
      maxTurns: maxTurns ?? 10,
      splitFilter: splitFilter || 'all',
      status: 'queued',
    },
  })

  await logAuditEvent({
    action: 'eval_run.created',
    entityType: 'eval_run',
    entityId: run.id,
    details: { suiteId, skillVersionId, executorType: executorType || 'claude-cli' },
  })

  return NextResponse.json(run, { status: 201 })
}
