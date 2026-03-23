import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const judge = await prisma.judgeDefinition.findUnique({ where: { id: params.id } })
  if (!judge) {
    return NextResponse.json({ error: 'Judge not found' }, { status: 404 })
  }

  const examples = await prisma.judgeExample.findMany({
    where: { judgeId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(examples)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { input, expectedLabel, humanCritique, split } = body

  if (!input || !expectedLabel) {
    return NextResponse.json(
      { error: 'input and expectedLabel are required' },
      { status: 400 }
    )
  }

  const validLabels = ['pass', 'fail']
  if (!validLabels.includes(expectedLabel)) {
    return NextResponse.json(
      { error: `expectedLabel must be one of: ${validLabels.join(', ')}` },
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

  const judge = await prisma.judgeDefinition.findUnique({ where: { id: params.id } })
  if (!judge) {
    return NextResponse.json({ error: 'Judge not found' }, { status: 404 })
  }

  const example = await prisma.judgeExample.create({
    data: {
      judgeId: params.id,
      input,
      expectedLabel,
      humanCritique: humanCritique || '',
      split: split || 'train',
    },
  })

  return NextResponse.json(example, { status: 201 })
}
