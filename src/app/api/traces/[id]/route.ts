import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const trace = await prisma.trace.findUnique({
    where: { id: params.id },
    include: {
      evalRun: {
        select: {
          id: true,
          suite: { select: { id: true, name: true, type: true } },
          skillRepo: { select: { id: true, displayName: true, slug: true } },
        },
      },
      skillVersion: {
        select: {
          id: true,
          commitMessage: true,
          branchName: true,
          createdAt: true,
        },
      },
      toolEvents: { orderBy: { sequence: 'asc' } },
      artifacts: { orderBy: { createdAt: 'asc' } },
      logChunks: { orderBy: { sequence: 'asc' } },
      caseRuns: {
        include: {
          evalCase: { select: { id: true, name: true, key: true, prompt: true } },
          assertions: true,
        },
      },
    },
  })

  if (!trace) {
    return NextResponse.json({ error: 'Trace not found' }, { status: 404 })
  }

  return NextResponse.json(trace)
}
