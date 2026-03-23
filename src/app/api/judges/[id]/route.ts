import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const judge = await prisma.judgeDefinition.findUnique({
    where: { id: params.id },
    include: {
      promptVersions: { orderBy: { version: 'desc' } },
      calibrationRuns: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      examples: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!judge) {
    return NextResponse.json({ error: 'Judge not found' }, { status: 404 })
  }

  return NextResponse.json(judge)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { name, purpose, scope, targetCriterion, model, status, outputSchema } = body

  const existing = await prisma.judgeDefinition.findUnique({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: 'Judge not found' }, { status: 404 })
  }

  const updated = await prisma.judgeDefinition.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(purpose !== undefined && { purpose }),
      ...(scope !== undefined && { scope }),
      ...(targetCriterion !== undefined && { targetCriterion }),
      ...(model !== undefined && { model }),
      ...(status !== undefined && { status }),
      ...(outputSchema !== undefined && { outputSchema: JSON.stringify(outputSchema) }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = await prisma.judgeDefinition.findUnique({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: 'Judge not found' }, { status: 404 })
  }

  await prisma.judgeDefinition.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
