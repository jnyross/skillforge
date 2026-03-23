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

  const versions = await prisma.judgePromptVersion.findMany({
    where: { judgeId: params.id },
    orderBy: { version: 'desc' },
  })

  return NextResponse.json(versions)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { systemPrompt, userPromptTemplate } = body

  if (!systemPrompt && !userPromptTemplate) {
    return NextResponse.json(
      { error: 'systemPrompt or userPromptTemplate is required' },
      { status: 400 }
    )
  }

  const judge = await prisma.judgeDefinition.findUnique({ where: { id: params.id } })
  if (!judge) {
    return NextResponse.json({ error: 'Judge not found' }, { status: 404 })
  }

  // Get next version number
  const latestVersion = await prisma.judgePromptVersion.findFirst({
    where: { judgeId: params.id },
    orderBy: { version: 'desc' },
  })
  const nextVersion = (latestVersion?.version ?? 0) + 1

  // Deactivate all existing versions
  await prisma.judgePromptVersion.updateMany({
    where: { judgeId: params.id },
    data: { active: false },
  })

  const promptVersion = await prisma.judgePromptVersion.create({
    data: {
      judgeId: params.id,
      version: nextVersion,
      systemPrompt: systemPrompt || '',
      userPromptTemplate: userPromptTemplate || '',
      active: true,
    },
  })

  return NextResponse.json(promptVersion, { status: 201 })
}
