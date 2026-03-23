import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startEvalRun } from '@/lib/services/eval'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.evalRun.findUnique({ where: { id: params.id } })
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (run.status !== 'queued') {
    return NextResponse.json(
      { error: `Cannot start run with status: ${run.status}. Only queued runs can be started.` },
      { status: 400 }
    )
  }

  const jobId = await startEvalRun(run.id)

  return NextResponse.json({ jobId, status: 'starting' })
}
