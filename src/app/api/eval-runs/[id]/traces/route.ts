import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const traces = await prisma.trace.findMany({
    where: { evalRunId: params.id },
    include: {
      _count: { select: { toolEvents: true, artifacts: true } },
      caseRuns: {
        select: {
          id: true,
          status: true,
          evalCase: { select: { id: true, name: true, key: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(traces)
}
