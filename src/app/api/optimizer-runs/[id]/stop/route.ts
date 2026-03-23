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

  const updated = await prisma.optimizerRun.update({
    where: { id: params.id },
    data: {
      status: 'stopped',
      completedAt: new Date(),
    },
  })

  await logAuditEvent({
    action: 'optimizer_run.stopped',
    entityType: 'optimizer_run',
    entityId: params.id,
    details: { previousStatus: run.status },
  })

  return NextResponse.json(updated)
}
