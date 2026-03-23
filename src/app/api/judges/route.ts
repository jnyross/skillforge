import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const judges = await prisma.judgeDefinition.findMany({
    include: {
      _count: { select: { promptVersions: true, calibrationRuns: true, examples: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(judges)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, purpose, scope, targetCriterion, model, outputSchema, systemPrompt, userPromptTemplate } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  try {
    const judge = await prisma.judgeDefinition.create({
      data: {
        name,
        purpose: purpose || '',
        scope: scope || '',
        targetCriterion: targetCriterion || '',
        model: model || 'claude-sonnet-4-20250514',
        outputSchema: outputSchema ? JSON.stringify(outputSchema) : '{}',
        promptVersions: (systemPrompt || userPromptTemplate) ? {
          create: {
            version: 1,
            systemPrompt: systemPrompt || '',
            userPromptTemplate: userPromptTemplate || '',
          },
        } : undefined,
      },
      include: { promptVersions: true },
    })

    return NextResponse.json(judge, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: `Judge "${name}" already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
