import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '@/lib/services/audit-log'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const skillRepoId = searchParams.get('skillRepoId')

  const where = skillRepoId ? { skillRepoId } : {}

  const runs = await prisma.optimizerRun.findMany({
    where,
    include: {
      skillRepo: { select: { displayName: true, slug: true } },
      _count: { select: { candidates: true, decisions: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(runs)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    skillRepoId, baselineVersionId, suiteIds,
    maxIterations, maxBudgetUsd, objectiveJson, promotionRules,
  } = body

  if (!skillRepoId || !baselineVersionId) {
    return NextResponse.json(
      { error: 'skillRepoId and baselineVersionId are required' },
      { status: 400 }
    )
  }

  const run = await prisma.optimizerRun.create({
    data: {
      skillRepoId,
      baselineVersionId,
      suiteIds: Array.isArray(suiteIds) ? suiteIds.join(',') : (suiteIds || ''),
      maxIterations: maxIterations ?? 10,
      maxBudgetUsd: maxBudgetUsd ?? null,
      objectiveJson: objectiveJson ? JSON.stringify(objectiveJson) : '{}',
      promotionRules: promotionRules ? JSON.stringify(promotionRules) : '{}',
      status: 'queued',
    },
  })

  await logAuditEvent({
    action: 'optimizer_run.created',
    entityType: 'optimizer_run',
    entityId: run.id,
    details: { skillRepoId, baselineVersionId, maxIterations },
  })

  return NextResponse.json(run, { status: 201 })
}
