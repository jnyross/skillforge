import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cases = await prisma.evalCase.findMany({
    where: { evalSuiteId: params.id },
    include: {
      _count: { select: { caseRuns: true, fixtures: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(cases)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { key, name, prompt, shouldTrigger, expectedOutcome, split, tags, configJson } = body

  if (!key || !name || !prompt) {
    return NextResponse.json(
      { error: 'key, name, and prompt are required' },
      { status: 400 }
    )
  }

  const suite = await prisma.evalSuite.findUnique({ where: { id: params.id } })
  if (!suite) {
    return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
  }
  if (suite.frozen) {
    return NextResponse.json(
      { error: 'Cannot add cases to a frozen suite' },
      { status: 400 }
    )
  }

  const validSplits = ['train', 'validation', 'holdout']
  if (split && !validSplits.includes(split)) {
    return NextResponse.json(
      { error: `split must be one of: ${validSplits.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const evalCase = await prisma.evalCase.create({
      data: {
        evalSuiteId: params.id,
        key,
        name,
        prompt,
        shouldTrigger: shouldTrigger ?? null,
        expectedOutcome: expectedOutcome || '',
        split: split || 'train',
        tags: Array.isArray(tags) ? tags.join(',') : (tags || ''),
        configJson: configJson ? JSON.stringify(configJson) : '{}',
      },
    })

    return NextResponse.json(evalCase, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: `Case key "${key}" already exists in this suite` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
