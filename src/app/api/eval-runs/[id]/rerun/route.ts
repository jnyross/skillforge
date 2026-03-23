import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '@/lib/services/audit-log'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const original = await prisma.evalRun.findUnique({
    where: { id: params.id },
    select: {
      skillRepoId: true,
      skillVersionId: true,
      baselineVersionId: true,
      suiteId: true,
      executorType: true,
      model: true,
      effort: true,
      permissionMode: true,
      maxTurns: true,
      splitFilter: true,
    },
  })

  if (!original) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  const newRun = await prisma.evalRun.create({
    data: {
      skillRepoId: original.skillRepoId,
      skillVersionId: original.skillVersionId,
      baselineVersionId: original.baselineVersionId,
      suiteId: original.suiteId,
      executorType: original.executorType,
      model: original.model,
      effort: original.effort,
      permissionMode: original.permissionMode,
      maxTurns: original.maxTurns,
      splitFilter: original.splitFilter,
      status: 'queued',
    },
  })

  await logAuditEvent({
    action: 'eval_run.rerun',
    entityType: 'eval_run',
    entityId: newRun.id,
    details: { originalRunId: params.id },
  })

  return NextResponse.json(newRun, { status: 201 })
}
