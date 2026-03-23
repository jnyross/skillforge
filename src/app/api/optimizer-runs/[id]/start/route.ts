import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enqueueJob, registerJobHandler } from '@/lib/services/job-queue'
import { logAuditEvent } from '@/lib/services/audit-log'

let handlersRegistered = false

async function ensureHandlers() {
  if (handlersRegistered) return
  handlersRegistered = true

  const { handleOptimizerJob } = await import('@/lib/services/optimizer/optimizer-engine')
  registerJobHandler('optimizer', handleOptimizerJob)
}

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

  if (run.status !== 'queued') {
    return NextResponse.json(
      { error: 'Can only start queued optimizer runs' },
      { status: 400 }
    )
  }

  await ensureHandlers()

  const jobId = await enqueueJob('optimizer', { optimizerRunId: params.id })

  await prisma.optimizerRun.update({
    where: { id: params.id },
    data: { jobId },
  })

  await logAuditEvent({
    action: 'optimizer_run.enqueued',
    entityType: 'optimizer_run',
    entityId: params.id,
    details: { jobId },
  })

  return NextResponse.json({ jobId, status: 'queued' })
}
