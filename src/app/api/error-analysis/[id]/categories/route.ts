import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const categories = await prisma.failureCategory.findMany({
    where: { analysisSessionId: params.id },
    orderBy: { count: 'desc' },
    include: {
      _count: { select: { traces: true } },
    },
  })
  return NextResponse.json(categories)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { name, description, severity } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const session = await prisma.errorAnalysisSession.findUnique({ where: { id: params.id } })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const category = await prisma.failureCategory.create({
    data: {
      analysisSessionId: params.id,
      name,
      description: description || '',
      severity: severity || 'major',
    },
  })

  return NextResponse.json(category, { status: 201 })
}
