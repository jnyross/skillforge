import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.evalRun.findUnique({
    where: { id: params.id },
    include: {
      skillRepo: { select: { id: true, displayName: true, slug: true } },
      skillVersion: true,
      baselineVersion: true,
      suite: { select: { id: true, name: true, type: true } },
      caseRuns: {
        include: {
          evalCase: true,
          assertions: true,
          trace: { select: { id: true, status: true, totalDurationMs: true, totalCostUsd: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      benchmarkSnapshots: true,
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

  const validStatuses = ['queued', 'running', 'completed', 'failed', 'cancelled']
  if (status !== undefined && !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(', ')}` },
      { status: 400 }
    )
  }

  const run = await prisma.evalRun.findUnique({ where: { id: params.id } })
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (status === 'cancelled') {
    if (run.status !== 'queued' && run.status !== 'running') {
      return NextResponse.json(
        { error: 'Can only cancel queued or running runs' },
        { status: 400 }
      )
    }
  }

  const updated = await prisma.evalRun.update({
    where: { id: params.id },
    data: {
      ...(status !== undefined && { status }),
      ...(status === 'cancelled' && { completedAt: new Date() }),
    },
  })

  return NextResponse.json(updated)
}
