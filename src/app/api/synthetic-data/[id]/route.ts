import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const config = await prisma.syntheticDataConfig.findUnique({
    where: { id: params.id },
    include: {
      evalSuite: { select: { id: true, name: true } },
      dimensions: true,
      generatedTuples: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!config) {
    return NextResponse.json({ error: 'Config not found' }, { status: 404 })
  }

  return NextResponse.json(config)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()

  const config = await prisma.syntheticDataConfig.findUnique({ where: { id: params.id } })
  if (!config) {
    return NextResponse.json({ error: 'Config not found' }, { status: 404 })
  }

  // Update tuple inclusion status
  if (body.tupleUpdates && Array.isArray(body.tupleUpdates)) {
    for (const update of body.tupleUpdates) {
      await prisma.syntheticTuple.update({
        where: { id: update.id },
        data: { included: update.included },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
