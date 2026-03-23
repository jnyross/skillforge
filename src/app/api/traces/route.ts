import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const evalRunId = searchParams.get('evalRunId')
  const skillVersionId = searchParams.get('skillVersionId')
  const status = searchParams.get('status')
  const model = searchParams.get('model')
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  const where: Record<string, unknown> = {}
  if (evalRunId) where.evalRunId = evalRunId
  if (skillVersionId) where.skillVersionId = skillVersionId
  if (status) where.status = status
  if (model) where.model = model

  const [traces, total] = await Promise.all([
    prisma.trace.findMany({
      where,
      include: {
        evalRun: {
          select: {
            id: true,
            suite: { select: { id: true, name: true, type: true } },
          },
        },
        skillVersion: {
          select: {
            id: true,
            commitMessage: true,
            skillRepo: { select: { displayName: true, slug: true } },
          },
        },
        _count: { select: { toolEvents: true, artifacts: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.trace.count({ where }),
  ])

  return NextResponse.json({ traces, total, limit, offset })
}
