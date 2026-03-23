import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '@/lib/services/audit-log'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.optimizerRun.findUnique({
    where: { id: params.id },
    include: {
      skillRepo: { select: { displayName: true, slug: true } },
      candidates: {
        include: {
          parentVersion: { select: { id: true, commitMessage: true, gitCommitSha: true } },
          candidateVersion: { select: { id: true, commitMessage: true, gitCommitSha: true } },
          mutations: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      decisions: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  return NextResponse.json(run)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { status } = body

  const validStatuses = ['queued', 'running', 'completed', 'stopped', 'failed']
  if (status !== undefined && !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(', ')}` },
      { status: 400 }
    )
  }

  const run = await prisma.optimizerRun.findUnique({ where: { id: params.id } })
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (status === 'stopped') {
    if (run.status !== 'running' && run.status !== 'queued') {
      return NextResponse.json(
        { error: 'Can only stop queued or running optimizer runs' },
        { status: 400 }
      )
    }

    await logAuditEvent({
      action: 'optimizer_run.stopped',
      entityType: 'optimizer_run',
      entityId: params.id,
    })
  }

  const updated = await prisma.optimizerRun.update({
    where: { id: params.id },
    data: {
      status,
      ...((status === 'stopped' || status === 'completed' || status === 'failed') && {
        completedAt: new Date(),
      }),
    },
  })

  return NextResponse.json(updated)
}
