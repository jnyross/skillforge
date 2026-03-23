import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { commitTuplesToSuite } from '@/lib/services/synthetic/synthetic-data-service'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const config = await prisma.syntheticDataConfig.findUnique({
    where: { id: params.id },
    select: { evalSuiteId: true },
  })

  if (!config) {
    return NextResponse.json({ error: 'Config not found' }, { status: 404 })
  }

  try {
    const result = await commitTuplesToSuite(params.id, config.evalSuiteId)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
