/**
 * GET /api/skill-repos/:id/optimize-trigger/:runId — Get optimization run progress.
 * POST /api/skill-repos/:id/optimize-trigger/:runId — Start or continue the optimization loop.
 * POST /api/skill-repos/:id/optimize-trigger/:runId?action=promote — Promote best description.
 * PATCH /api/skill-repos/:id/optimize-trigger/:runId — Update queries (user edits before running).
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getProgress, runOptimizationLoop, promoteBestDescription } from '@/lib/services/trigger-optimizer/trigger-optimizer-service'
import { getFilesAtCommit, createVersion } from '@/lib/services/git-storage'
import { updateDescription } from '@/lib/services/trigger-optimizer/trigger-evaluator'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { runId } = await params

  try {
    const progress = await getProgress(runId)
    return NextResponse.json(progress)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Run not found' },
      { status: 404 }
    )
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { id: skillRepoId, runId } = await params
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    if (action === 'promote') {
      // Promote best description
      const { description } = await promoteBestDescription(runId)

      // Get the skill repo and version
      const run = await prisma.triggerOptimizationRun.findUniqueOrThrow({
        where: { id: runId },
      })

      const repo = await prisma.skillRepo.findUniqueOrThrow({
        where: { id: skillRepoId },
      })

      const version = await prisma.skillVersion.findUniqueOrThrow({
        where: { id: run.skillVersionId },
      })

      // Read current skill files and update description
      const files = await getFilesAtCommit(repo.gitRepoPath, version.gitCommitSha)
      const updatedFiles = files.map(f => {
        if (f.path === 'SKILL.md') {
          const updatedContent = updateDescription(f.content, description)
          return {
            ...f,
            content: updatedContent,
            size: updatedContent.length,
          }
        }
        return f
      })

      // Create new version with updated description
      const commitSha = await createVersion(
        repo.gitRepoPath,
        updatedFiles,
        `chore: optimize trigger description (test score: ${(run.bestTestScore * 100).toFixed(0)}%)`,
      )

      // Record new version in DB
      const newVersion = await prisma.skillVersion.create({
        data: {
          skillRepoId,
          branchName: 'main',
          gitCommitSha: commitSha,
          parentVersionId: version.id,
          commitMessage: `Optimize trigger description (test score: ${(run.bestTestScore * 100).toFixed(0)}%)`,
          createdBy: 'trigger-optimizer',
          tokenCount: updatedFiles.reduce((sum, f) => sum + f.content.length, 0),
          lineCount: updatedFiles.reduce((sum, f) => sum + f.content.split('\n').length, 0),
          fileCount: updatedFiles.length,
        },
      })

      // Update repo description
      await prisma.skillRepo.update({
        where: { id: skillRepoId },
        data: { description },
      })

      return NextResponse.json({
        promoted: true,
        description,
        newVersionId: newVersion.id,
        commitSha,
      })
    }

    // Default: start/continue optimization loop
    const run = await prisma.triggerOptimizationRun.findUniqueOrThrow({
      where: { id: runId },
    })

    // Get skill content for the optimization loop
    const repo = await prisma.skillRepo.findUniqueOrThrow({
      where: { id: skillRepoId },
    })
    const version = await prisma.skillVersion.findUniqueOrThrow({
      where: { id: run.skillVersionId },
    })
    const files = await getFilesAtCommit(repo.gitRepoPath, version.gitCommitSha)
    const skillFile = files.find(f => f.path === 'SKILL.md')

    if (!skillFile) {
      return NextResponse.json({ error: 'No SKILL.md found' }, { status: 400 })
    }

    const progress = await runOptimizationLoop(runId, skillFile.content)
    return NextResponse.json(progress)
  } catch (err) {
    console.error('Trigger optimization error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Optimization failed' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { runId } = await params

  try {
    const body = await req.json()

    // Only allow editing queries before running
    const currentRun = await prisma.triggerOptimizationRun.findUniqueOrThrow({
      where: { id: runId },
    })
    if (currentRun.status !== 'reviewing' && currentRun.status !== 'generating-queries') {
      return NextResponse.json(
        { error: `Cannot edit queries: run is in '${currentRun.status}' status` },
        { status: 400 }
      )
    }

    const updateData: Record<string, string> = {}
    if (body.queriesJson) updateData.queriesJson = JSON.stringify(body.queriesJson)
    if (body.trainIndices) updateData.trainIndices = JSON.stringify(body.trainIndices)
    if (body.testIndices) updateData.testIndices = JSON.stringify(body.testIndices)

    const run = await prisma.triggerOptimizationRun.update({
      where: { id: runId },
      data: updateData,
    })

    return NextResponse.json(run)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 }
    )
  }
}
