import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; caseId: string } }
) {
  const evalCase = await prisma.evalCase.findUnique({
    where: { id: params.caseId },
    include: {
      fixtures: true,
      caseRuns: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          assertions: true,
        },
      },
    },
  })

  if (!evalCase || evalCase.evalSuiteId !== params.id) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  return NextResponse.json(evalCase)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; caseId: string } }
) {
  const body = await request.json()
  const evalCase = await prisma.evalCase.findUnique({ where: { id: params.caseId } })

  if (!evalCase || evalCase.evalSuiteId !== params.id) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  const suite = await prisma.evalSuite.findUnique({ where: { id: params.id } })
  if (suite?.frozen) {
    return NextResponse.json(
      { error: 'Cannot modify cases in a frozen suite' },
      { status: 400 }
    )
  }

  const { name, prompt, shouldTrigger, expectedOutcome, split, tags, configJson } = body

  const updated = await prisma.evalCase.update({
    where: { id: params.caseId },
    data: {
      ...(name !== undefined && { name }),
      ...(prompt !== undefined && { prompt }),
      ...(shouldTrigger !== undefined && { shouldTrigger }),
      ...(expectedOutcome !== undefined && { expectedOutcome }),
      ...(split !== undefined && { split }),
      ...(tags !== undefined && { tags: Array.isArray(tags) ? tags.join(',') : tags }),
      ...(configJson !== undefined && { configJson: JSON.stringify(configJson) }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; caseId: string } }
) {
  const evalCase = await prisma.evalCase.findUnique({ where: { id: params.caseId } })

  if (!evalCase || evalCase.evalSuiteId !== params.id) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  const suite = await prisma.evalSuite.findUnique({ where: { id: params.id } })
  if (suite?.frozen) {
    return NextResponse.json(
      { error: 'Cannot delete cases from a frozen suite' },
      { status: 400 }
    )
  }

  await prisma.evalCase.delete({ where: { id: params.caseId } })
  return NextResponse.json({ ok: true })
}
