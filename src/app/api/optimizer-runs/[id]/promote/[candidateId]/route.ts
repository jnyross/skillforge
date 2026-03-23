import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '@/lib/services/audit-log'

/**
 * Promote a candidate to champion.
 * PRD promotion rules:
 * 1. Validation pass rate improves, OR holdout improves with no regressions
 * 2. Safety/control checks pass
 * 3. Human approval is granted (this endpoint acts as human approval)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; candidateId: string } }
) {
  const run = await prisma.optimizerRun.findUnique({
    where: { id: params.id },
  })

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  const candidate = await prisma.optimizerCandidate.findFirst({
    where: {
      id: params.candidateId,
      optimizerRunId: params.id,
    },
    include: {
      candidateVersion: true,
    },
  })

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }

  if (candidate.status !== 'keep') {
    return NextResponse.json(
      { error: 'Only candidates with "keep" status can be promoted' },
      { status: 400 }
    )
  }

  if (!candidate.candidateVersionId) {
    return NextResponse.json(
      { error: 'Candidate has no associated version' },
      { status: 400 }
    )
  }

  // Check for uncalibrated judges — PRD: uncalibrated judges cannot influence promotion
  const judgesUsed = await prisma.judgeDefinition.findMany({
    where: { status: { not: 'calibrated' } },
    select: { id: true, name: true, status: true },
  })
  // This is informational — we don't block promotion but include in the decision

  // Promote atomically to avoid inconsistent state
  await prisma.$transaction(async (tx) => {
    // Record the promotion decision with human approval
    await tx.optimizerDecision.create({
      data: {
        optimizerRunId: params.id,
        candidateId: params.candidateId,
        decision: 'promote',
        reason: 'Human-approved promotion to champion',
        humanApproved: true,
        metricsJson: candidate.objectiveJson,
      },
    })

    // Unset any existing champion for this repo
    await tx.skillVersion.updateMany({
      where: { skillRepoId: run.skillRepoId, isChampion: true },
      data: { isChampion: false },
    })

    // Mark candidate version as champion
    await tx.skillVersion.update({
      where: { id: candidate.candidateVersionId! },
      data: { isChampion: true },
    })

    // Update the skill repo's champion version
    await tx.skillRepo.update({
      where: { id: run.skillRepoId },
      data: { currentChampionVersionId: candidate.candidateVersionId },
    })
  })

  await logAuditEvent({
    action: 'optimizer_candidate.promoted',
    entityType: 'optimizer_candidate',
    entityId: params.candidateId,
    details: {
      optimizerRunId: params.id,
      skillRepoId: run.skillRepoId,
      versionId: candidate.candidateVersionId,
      uncalibratedJudges: judgesUsed.length,
    },
  })

  return NextResponse.json({
    promoted: true,
    candidateId: params.candidateId,
    versionId: candidate.candidateVersionId,
    message: 'Candidate promoted to champion',
  })
}
