import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const entityType = searchParams.get('entityType')
  const entityId = searchParams.get('entityId')
  const actor = searchParams.get('actor')
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

  const where: Record<string, unknown> = {}
  if (action) where.action = { contains: action }
  if (entityType) where.entityType = entityType
  if (entityId) where.entityId = entityId
  if (actor) where.actor = actor

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, limit, offset })
}
