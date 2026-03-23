import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const traces = await prisma.errorAnalysisTrace.findMany({
    where: { analysisSessionId: params.id },
    orderBy: { sequence: 'asc' },
    include: {
      trace: {
        select: { id: true, status: true, model: true, totalDurationMs: true, resultJson: true },
      },
      failureCategory: {
        select: { id: true, name: true, severity: true },
      },
    },
  })
  return NextResponse.json(traces)
}
