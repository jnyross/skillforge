import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateCrossProduct } from '@/lib/services/synthetic/synthetic-data-service'

export async function GET(request: NextRequest) {
  const suiteId = request.nextUrl.searchParams.get('suiteId')

  const configs = await prisma.syntheticDataConfig.findMany({
    where: suiteId ? { evalSuiteId: suiteId } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      evalSuite: { select: { id: true, name: true } },
      dimensions: true,
      _count: { select: { generatedTuples: true } },
    },
  })

  return NextResponse.json(configs)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { evalSuiteId, name, dimensions } = body

  if (!evalSuiteId || !dimensions || !Array.isArray(dimensions) || dimensions.length === 0) {
    return NextResponse.json(
      { error: 'evalSuiteId and at least one dimension are required' },
      { status: 400 }
    )
  }

  const suite = await prisma.evalSuite.findUnique({ where: { id: evalSuiteId } })
  if (!suite) {
    return NextResponse.json({ error: 'Target suite not found' }, { status: 404 })
  }

  // Create config with dimensions in a transaction
  const config = await prisma.$transaction(async (tx) => {
    const cfg = await tx.syntheticDataConfig.create({
      data: {
        evalSuiteId,
        name: name || 'Synthetic Config',
        status: 'draft',
      },
    })

    for (const dim of dimensions) {
      await tx.syntheticDimension.create({
        data: {
          configId: cfg.id,
          name: dim.name,
          values: JSON.stringify(dim.values),
        },
      })
    }

    // Generate cross-product tuples
    const tuples = generateCrossProduct(
      dimensions.map((d: { name: string; values: string[] }) => ({
        name: d.name,
        values: d.values,
      }))
    )

    for (const tuple of tuples) {
      await tx.syntheticTuple.create({
        data: {
          configId: cfg.id,
          dimensionValues: JSON.stringify(tuple),
          included: true,
        },
      })
    }

    return cfg
  })

  const full = await prisma.syntheticDataConfig.findUnique({
    where: { id: config.id },
    include: {
      dimensions: true,
      _count: { select: { generatedTuples: true } },
    },
  })

  return NextResponse.json(full, { status: 201 })
}
