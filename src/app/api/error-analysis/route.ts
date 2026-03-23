import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sampleTraces } from '@/lib/services/error-analysis/error-analysis-service'

export async function GET() {
  const sessions = await prisma.errorAnalysisSession.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      skillRepo: { select: { id: true, displayName: true } },
      _count: { select: { traces: true, categories: true } },
    },
  })
  return NextResponse.json(sessions)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { skillRepoId, name, description, samplingStrategy, targetTraceCount } = body

  if (!skillRepoId || !name) {
    return NextResponse.json({ error: 'skillRepoId and name are required' }, { status: 400 })
  }

  const repo = await prisma.skillRepo.findUnique({ where: { id: skillRepoId } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const session = await prisma.errorAnalysisSession.create({
    data: {
      skillRepoId,
      name,
      description: description || '',
      samplingStrategy: samplingStrategy || 'random',
      targetTraceCount: targetTraceCount || 100,
    },
  })

  // Sample traces and add to session
  const strategy = samplingStrategy || 'random'
  const count = targetTraceCount || 100
  const traceIds = await sampleTraces(skillRepoId, strategy, count)

  for (let i = 0; i < traceIds.length; i++) {
    await prisma.errorAnalysisTrace.create({
      data: {
        analysisSessionId: session.id,
        traceId: traceIds[i],
        sequence: i + 1,
      },
    })
  }

  return NextResponse.json(session, { status: 201 })
}
