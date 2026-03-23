import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const skillRepoId = searchParams.get('skillRepoId')

  const where = skillRepoId ? { skillRepoId } : {}

  const suites = await prisma.evalSuite.findMany({
    where,
    include: {
      _count: { select: { cases: true, evalRuns: true } },
      skillRepo: { select: { displayName: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(suites)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { skillRepoId, name, type, splitPolicy, description } = body

  if (!skillRepoId || !name || !type) {
    return NextResponse.json(
      { error: 'skillRepoId, name, and type are required' },
      { status: 400 }
    )
  }

  const validTypes = ['trigger', 'output', 'workflow', 'regression', 'blind', 'calibration']
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const suite = await prisma.evalSuite.create({
      data: {
        skillRepoId,
        name,
        type,
        splitPolicy: splitPolicy || 'random',
        description: description || '',
      },
    })

    return NextResponse.json(suite, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: `Suite "${name}" already exists for this repo` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
