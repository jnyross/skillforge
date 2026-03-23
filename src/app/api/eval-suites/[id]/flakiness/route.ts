import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/eval-suites/:id/flakiness — Compute flakiness metrics across recent runs
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const suite = await prisma.evalSuite.findUnique({
    where: { id },
    select: { id: true, name: true },
  })

  if (!suite) {
    return NextResponse.json({ error: 'Suite not found' }, { status: 404 })
  }

  // Get recent completed runs for this suite (last 10)
  const recentRuns = await prisma.evalRun.findMany({
    where: { suiteId: id, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, createdAt: true },
  })

  if (recentRuns.length < 2) {
    return NextResponse.json({
      suiteId: id,
      suiteName: suite.name,
      totalCases: 0,
      flakyCases: [],
      stableCases: 0,
      flakinessRate: 0,
      runsAnalyzed: recentRuns.length,
      message: 'Need at least 2 completed runs to compute flakiness',
    })
  }

  // Get all case runs from these runs
  const runIds = recentRuns.map(r => r.id)
  const caseRuns = await prisma.evalCaseRun.findMany({
    where: { evalRunId: { in: runIds } },
    select: {
      evalCaseId: true,
      evalRunId: true,
      status: true,
      evalCase: { select: { key: true, name: true } },
    },
  })

  // Group by case
  const caseResults = new Map<string, {
    key: string
    name: string
    outcomes: string[]
  }>()

  for (const cr of caseRuns) {
    const existing = caseResults.get(cr.evalCaseId)
    if (existing) {
      existing.outcomes.push(cr.status)
    } else {
      caseResults.set(cr.evalCaseId, {
        key: cr.evalCase.key,
        name: cr.evalCase.name,
        outcomes: [cr.status],
      })
    }
  }

  // Identify flaky cases (inconsistent pass/fail across runs)
  const flakyCases: Array<{
    caseId: string
    key: string
    name: string
    passCount: number
    failCount: number
    totalRuns: number
    flakinessScore: number
  }> = []

  let stableCases = 0

  for (const [caseId, data] of caseResults) {
    const passCount = data.outcomes.filter(o => o === 'passed').length
    const failCount = data.outcomes.filter(o => o === 'failed' || o === 'error').length
    const totalRuns = data.outcomes.length

    if (totalRuns < 2) continue

    // A case is flaky if it has both passes and failures
    const hasPass = passCount > 0
    const hasFail = failCount > 0

    if (hasPass && hasFail) {
      // Flakiness score: 0 = always same result, 1 = maximally flaky (50/50)
      const passRate = passCount / totalRuns
      const flakinessScore = 1 - Math.abs(2 * passRate - 1)

      flakyCases.push({
        caseId,
        key: data.key,
        name: data.name,
        passCount,
        failCount,
        totalRuns,
        flakinessScore: Math.round(flakinessScore * 100) / 100,
      })
    } else {
      stableCases++
    }
  }

  // Sort by flakiness score (most flaky first)
  flakyCases.sort((a, b) => b.flakinessScore - a.flakinessScore)

  const totalCases = caseResults.size
  const flakinessRate = totalCases > 0 ? flakyCases.length / totalCases : 0

  return NextResponse.json({
    suiteId: id,
    suiteName: suite.name,
    totalCases,
    flakyCases,
    stableCases,
    flakinessRate: Math.round(flakinessRate * 100) / 100,
    runsAnalyzed: recentRuns.length,
  })
}
