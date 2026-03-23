import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; traceId: string } }
) {
  const body = await request.json()
  const { openCodingNotes, failureCategoryId, isNewFailureMode } = body

  const trace = await prisma.errorAnalysisTrace.findFirst({
    where: { analysisSessionId: params.id, id: params.traceId },
  })

  if (!trace) {
    return NextResponse.json({ error: 'Trace not found in this session' }, { status: 404 })
  }

  const updated = await prisma.errorAnalysisTrace.update({
    where: { id: params.traceId },
    data: {
      ...(openCodingNotes !== undefined && { openCodingNotes }),
      ...(failureCategoryId !== undefined && { failureCategoryId }),
      ...(isNewFailureMode !== undefined && { isNewFailureMode }),
      reviewedAt: new Date(),
    },
  })

  // Update category count if assigned
  if (failureCategoryId) {
    const count = await prisma.errorAnalysisTrace.count({
      where: { failureCategoryId },
    })
    await prisma.failureCategory.update({
      where: { id: failureCategoryId },
      data: { count },
    })
  }

  // Update old category count if trace was previously assigned to a different category
  if (trace.failureCategoryId && trace.failureCategoryId !== failureCategoryId) {
    const oldCount = await prisma.errorAnalysisTrace.count({
      where: { failureCategoryId: trace.failureCategoryId },
    })
    await prisma.failureCategory.update({
      where: { id: trace.failureCategoryId },
      data: { count: oldCount },
    })
  }

  return NextResponse.json(updated)
}
