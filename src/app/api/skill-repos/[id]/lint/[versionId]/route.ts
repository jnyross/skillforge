import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/skill-repos/:id/lint/:versionId — Get lint results for a specific version
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const version = await prisma.skillVersion.findUnique({
    where: { id: params.versionId, skillRepoId: params.id },
  })

  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  const lintResults = await prisma.lintResult.findMany({
    where: { skillVersionId: params.versionId },
    orderBy: { createdAt: 'asc' },
  })

  const errorCount = lintResults.filter(r => r.severity === 'error').length
  const warningCount = lintResults.filter(r => r.severity === 'warning').length
  const infoCount = lintResults.filter(r => r.severity === 'info').length

  return NextResponse.json({
    versionId: params.versionId,
    issues: lintResults,
    passed: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
  })
}
