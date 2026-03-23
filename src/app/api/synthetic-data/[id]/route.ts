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

  // Add a dimension
  if (body.addDimension) {
    const maxOrder = await prisma.syntheticDimension.aggregate({
      where: { configId: params.id },
      _max: { order: true },
    })
    await prisma.syntheticDimension.create({
      data: {
        configId: params.id,
        name: body.addDimension.name,
        values: body.addDimension.values,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    })
  }

  // Remove a dimension (scoped to owning config)
  if (body.removeDimensionId) {
    await prisma.syntheticDimension.delete({
      where: { id: body.removeDimensionId, configId: params.id },
    })
  }

  // Toggle tuple inclusion (scoped to owning config)
  if (body.toggleTupleId) {
    await prisma.syntheticTuple.update({
      where: { id: body.toggleTupleId, configId: params.id },
      data: { included: body.included ?? false },
    })
  }

  // Batch update tuple inclusion (scoped to owning config)
  if (body.tupleUpdates && Array.isArray(body.tupleUpdates)) {
    for (const update of body.tupleUpdates) {
      await prisma.syntheticTuple.update({
        where: { id: update.id, configId: params.id },
        data: { included: update.included },
      })
    }
  }

  const updated = await prisma.syntheticDataConfig.findUnique({
    where: { id: params.id },
    include: {
      evalSuite: { select: { id: true, name: true, type: true } },
      dimensions: { orderBy: { order: 'asc' } },
      generatedTuples: { orderBy: { createdAt: 'asc' } },
    },
  })

  return NextResponse.json(updated)
}
