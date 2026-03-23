import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { expandTuplesToNaturalLanguage } from '@/lib/services/synthetic/synthetic-data-service'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const config = await prisma.syntheticDataConfig.findUnique({
    where: { id: params.id },
    include: {
      generatedTuples: { where: { included: true } },
    },
  })

  if (!config) {
    return NextResponse.json({ error: 'Config not found' }, { status: 404 })
  }

  const tuples = config.generatedTuples.map((t) => {
    try {
      return JSON.parse(t.dimensionValues) as Record<string, string>
    } catch {
      return {} as Record<string, string>
    }
  })

  const expanded = await expandTuplesToNaturalLanguage(tuples, config.name)

  // Update tuples with generated prompts
  for (let i = 0; i < expanded.length && i < config.generatedTuples.length; i++) {
    await prisma.syntheticTuple.update({
      where: { id: config.generatedTuples[i].id },
      data: { naturalLanguage: expanded[i].naturalLanguage },
    })
  }

  await prisma.syntheticDataConfig.update({
    where: { id: params.id },
    data: { status: 'review' },
  })

  return NextResponse.json({ expanded: expanded.length })
}
