import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; categoryId: string } }
) {
  const body = await request.json()
  const { name, description, severity } = body

  const category = await prisma.failureCategory.findFirst({
    where: { id: params.categoryId, analysisSessionId: params.id },
  })

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const updated = await prisma.failureCategory.update({
    where: { id: params.categoryId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(severity !== undefined && { severity }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; categoryId: string } }
) {
  const category = await prisma.failureCategory.findFirst({
    where: { id: params.categoryId, analysisSessionId: params.id },
  })

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // Unassign traces from this category
  await prisma.errorAnalysisTrace.updateMany({
    where: { failureCategoryId: params.categoryId },
    data: { failureCategoryId: null },
  })

  await prisma.failureCategory.delete({ where: { id: params.categoryId } })
  return NextResponse.json({ ok: true })
}
