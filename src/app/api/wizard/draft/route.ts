import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const drafts = await prisma.wizardDraft.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(drafts)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { intent, artifactsJson } = body

  const draft = await prisma.wizardDraft.create({
    data: {
      intent: intent || '',
      artifactsJson: artifactsJson ? JSON.stringify(artifactsJson) : '[]',
      status: 'intake',
    },
  })

  return NextResponse.json(draft, { status: 201 })
}
