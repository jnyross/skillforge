import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; candidateId: string } }
) {
  const candidate = await prisma.optimizerCandidate.findFirst({
    where: {
      id: params.candidateId,
      optimizerRunId: params.id,
    },
    include: {
      parentVersion: {
        select: { id: true, commitMessage: true, gitCommitSha: true },
      },
      candidateVersion: {
        select: { id: true, commitMessage: true, gitCommitSha: true },
      },
      mutations: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }

  return NextResponse.json(candidate)
}
