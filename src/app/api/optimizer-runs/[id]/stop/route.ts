import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '@/lib/services/audit-log'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.optimizerRun.findUnique({
    where: { id: params.id },
  })

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (run.status !== 'running' && run.status !== 'queued') {
    return NextResponse.json(
      { error: 'Can only stop queued or running optimizer runs' },
      { status: 400 }
    )
  }

  // Use conditional update to avoid TOCTOU race with the optimizer engine
  const updated = await prisma.optimizerRun.updateMany({
    where: { id: params.id, status: { in: ['running', 'queued'] } },
    data: {
      status: 'stopped',
      completedAt: new Date(),
    },
  })

  if (updated.count === 0) {
    return NextResponse.json(
      { error: 'Run status changed before it could be stopped' },
      { status: 409 }
    )
  }

  await logAuditEvent({
    action: 'optimizer_run.stopped',
    entityType: 'optimizer_run',
    entityId: params.id,
    details: { previousStatus: run.status },
  })

  return NextResponse.json({ id: params.id, status: 'stopped' })
}
