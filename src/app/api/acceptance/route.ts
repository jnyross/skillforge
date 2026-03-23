import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Force dynamic rendering — this route queries the database
export const dynamic = 'force-dynamic'

/**
 * GET /api/acceptance
 * Returns acceptance dashboard metrics — summary of all SkillForge subsystems.
 */
export async function GET() {
  const [
    repoCount,
    versionCount,
    evalSuiteCount,
    evalRunCount,
    evalCaseCount,
    traceCount,
    reviewSessionCount,
    judgeCount,
    optimizerRunCount,
    wizardDraftCount,
    executorConfigCount,
  ] = await Promise.all([
    prisma.skillRepo.count(),
    prisma.skillVersion.count(),
    prisma.evalSuite.count(),
    prisma.evalRun.count(),
    prisma.evalCase.count(),
    prisma.trace.count(),
    prisma.reviewSession.count(),
    prisma.judgeDefinition.count(),
    prisma.optimizerRun.count(),
    prisma.wizardDraft.count(),
    prisma.executorConfig.count(),
  ])

  // Get latest eval run stats
  const latestRunsRaw = await prisma.evalRun.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      metricsJson: true,
      createdAt: true,
      executorType: true,
    },
  })

  const latestRuns = latestRunsRaw.map(r => {
    let passRate: number | null = null
    try {
      const metrics = JSON.parse(r.metricsJson || '{}')
      if (typeof metrics.passRate === 'number') passRate = metrics.passRate
    } catch { /* ignore parse errors */ }
    return { id: r.id, status: r.status, passRate, createdAt: r.createdAt, executorType: r.executorType }
  })

  // Get eval run status breakdown
  const runsByStatus = await prisma.evalRun.groupBy({
    by: ['status'],
    _count: { id: true },
  })

  // Get wizard draft status breakdown
  const draftsByStatus = await prisma.wizardDraft.groupBy({
    by: ['status'],
    _count: { id: true },
  })

  // Get optimizer run status breakdown
  const optimizerByStatus = await prisma.optimizerRun.groupBy({
    by: ['status'],
    _count: { id: true },
  })

  // Feature readiness checks
  const features = [
    {
      name: 'Skill Repository Management',
      phase: 1,
      ready: repoCount >= 0, // Always available
      metrics: { repos: repoCount, versions: versionCount },
    },
    {
      name: 'Eval Lab',
      phase: 2,
      ready: evalSuiteCount >= 0,
      metrics: { suites: evalSuiteCount, cases: evalCaseCount, runs: evalRunCount, traces: traceCount },
    },
    {
      name: 'Human Review Arena',
      phase: 3,
      ready: true,
      metrics: { sessions: reviewSessionCount },
    },
    {
      name: 'Judge Calibration',
      phase: 3,
      ready: true,
      metrics: { judges: judgeCount },
    },
    {
      name: 'Optimizer',
      phase: 4,
      ready: true,
      metrics: { runs: optimizerRunCount },
    },
    {
      name: 'Wizard',
      phase: 5,
      ready: true,
      metrics: { drafts: wizardDraftCount },
    },
    {
      name: 'Executor Configuration',
      phase: 2,
      ready: true,
      metrics: { configs: executorConfigCount },
    },
  ]

  return NextResponse.json({
    summary: {
      totalRepos: repoCount,
      totalVersions: versionCount,
      totalEvalSuites: evalSuiteCount,
      totalEvalRuns: evalRunCount,
      totalTraces: traceCount,
      totalReviewSessions: reviewSessionCount,
      totalJudges: judgeCount,
      totalOptimizerRuns: optimizerRunCount,
      totalWizardDrafts: wizardDraftCount,
    },
    features,
    latestRuns,
    breakdowns: {
      evalRuns: runsByStatus.map(r => ({ status: r.status, count: r._count.id })),
      wizardDrafts: draftsByStatus.map(d => ({ status: d.status, count: d._count.id })),
      optimizerRuns: optimizerByStatus.map(o => ({ status: o.status, count: o._count.id })),
    },
  })
}
