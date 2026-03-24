/**
 * POST /api/skill-repos/:id/optimize-trigger — Start a trigger optimization run.
 * GET /api/skill-repos/:id/optimize-trigger — List all optimization runs for a skill.
 */

import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { startOptimization } from '@/lib/services/trigger-optimizer/trigger-optimizer-service'
import { getFilesAtCommit } from '@/lib/services/git-storage'

const prisma = new PrismaClient()

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: skillRepoId } = await params
  const runs = await prisma.triggerOptimizationRun.findMany({
    where: { skillRepoId },
    orderBy: { createdAt: 'desc' },
    include: {
      iterations: {
        orderBy: { iteration: 'asc' },
      },
    },
  })

  return NextResponse.json(runs)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: skillRepoId } = await params

  try {
    const body = await req.json()
    const maxIterations = body.maxIterations ?? 5

    // Get the skill repo and latest version
    const repo = await prisma.skillRepo.findUnique({
      where: { id: skillRepoId },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!repo || repo.versions.length === 0) {
      return NextResponse.json({ error: 'Skill repo or version not found' }, { status: 404 })
    }

    const version = repo.versions[0]

    // Read the SKILL.md content from the git repo
    const files = await getFilesAtCommit(repo.gitRepoPath, version.gitCommitSha)
    const skillFile = files.find(f => f.path === 'SKILL.md')

    if (!skillFile) {
      return NextResponse.json({ error: 'No SKILL.md found in skill repo' }, { status: 400 })
    }

    // Extract description from frontmatter
    const description = extractDescription(skillFile.content) || repo.description

    const runId = await startOptimization(
      skillRepoId,
      version.id,
      skillFile.content,
      description,
      maxIterations,
    )

    return NextResponse.json({ runId, status: 'generating-queries' }, { status: 201 })
  } catch (err) {
    console.error('Failed to start trigger optimization:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start optimization' },
      { status: 500 }
    )
  }
}

function extractDescription(content: string): string {
  if (!content.startsWith('---')) return ''
  const endIdx = content.indexOf('---', 3)
  if (endIdx === -1) return ''
  const fm = content.slice(3, endIdx)
  const match = fm.match(/description:\s*(.+)/i)
  return match ? match[1].trim() : ''
}
