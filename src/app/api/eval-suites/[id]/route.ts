import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const suite = await prisma.evalSuite.findUnique({
    where: { id: params.id },
    include: {
      cases: {
        include: {
          _count: { select: { caseRuns: true, fixtures: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      evalRuns: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      skillRepo: { select: { displayName: true, slug: true } },
    },
  })

  if (!suite) {
    return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
  }

  return NextResponse.json(suite)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { name, description, frozen, splitPolicy } = body

  const suite = await prisma.evalSuite.findUnique({ where: { id: params.id } })
  if (!suite) {
    return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
  }

  if (suite.frozen && !body.frozen) {
    return NextResponse.json(
      { error: 'Cannot modify a frozen suite' },
      { status: 400 }
    )
  }

  const updated = await prisma.evalSuite.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(frozen !== undefined && { frozen }),
      ...(splitPolicy !== undefined && { splitPolicy }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const suite = await prisma.evalSuite.findUnique({ where: { id: params.id } })
  if (!suite) {
    return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
  }

  if (suite.frozen) {
    return NextResponse.json(
      { error: 'Cannot delete a frozen suite' },
      { status: 400 }
    )
  }

  await prisma.evalSuite.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
