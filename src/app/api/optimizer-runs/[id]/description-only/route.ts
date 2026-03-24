/**
 * POST /api/optimizer-runs/:id/description-only
 * 
 * Runs a single description-only mutation on the optimizer run's baseline version.
 * This is a lightweight mode that only rewrites the description field in YAML frontmatter
 * for better triggering, without changing instructions or structure.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateMutation } from '@/lib/services/optimizer/mutation-service'
import { logAuditEvent } from '@/lib/services/audit-log'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const run = await prisma.optimizerRun.findUnique({
    where: { id },
    include: {
      skillRepo: { select: { id: true, gitRepoPath: true } },
    },
  })

  if (!run) {
    return NextResponse.json({ error: 'Optimizer run not found' }, { status: 404 })
  }

  // Load baseline version content
  const baselineVersion = await prisma.skillVersion.findUnique({
    where: { id: run.baselineVersionId },
    select: { id: true, gitCommitSha: true },
  })

  if (!baselineVersion) {
    return NextResponse.json({ error: 'Baseline version not found' }, { status: 404 })
  }

  try {
    // Read current skill content from git
    const { getFilesAtCommit } = await import('@/lib/services/git-storage')
    const files = await getFilesAtCommit(run.skillRepo.gitRepoPath, baselineVersion.gitCommitSha)
    const skillFile = files.find((f: { path: string }) => f.path.endsWith('SKILL.md'))
    const skillContent = skillFile?.content || ''

    // Generate description-only mutation
    const mutationResult = await generateMutation({
      mode: 'description-only',
      currentSkillContent: skillContent,
      currentFiles: files
        .filter((f: { path: string }) => !f.path.endsWith('SKILL.md'))
        .map((f: { path: string; content: string }) => ({ path: f.path, content: f.content })),
    })

    // Create a new version with the mutated description
    const { createVersion } = await import('@/lib/services/git-storage')
    const allFiles = [
      {
        path: skillFile?.path || 'SKILL.md',
        content: mutationResult.newSkillContent,
        size: Buffer.byteLength(mutationResult.newSkillContent, 'utf-8'),
      },
      ...files
        .filter((f: { path: string }) => !f.path.endsWith('SKILL.md'))
        .map((f: { path: string; content: string; size: number }) => f),
    ]

    const newCommitSha = await createVersion(
      run.skillRepo.gitRepoPath,
      allFiles,
      'optimizer: description-only mutation'
    )

    const newVersion = await prisma.skillVersion.create({
      data: {
        skillRepoId: run.skillRepo.id,
        gitCommitSha: newCommitSha,
        commitMessage: 'optimizer: description-only mutation',
        parentVersionId: baselineVersion.id,
      },
    })

    // Create candidate record
    const candidate = await prisma.optimizerCandidate.create({
      data: {
        optimizerRunId: id,
        parentVersionId: baselineVersion.id,
        candidateVersionId: newVersion.id,
        mutationType: 'description-only',
        rationale: mutationResult.rationale,
        patchDiff: mutationResult.mutations.map(m =>
          `${m.operator}: ${m.beforeSnippet} → ${m.afterSnippet}`
        ).join('\n'),
        status: 'keep',
        completedAt: new Date(),
      },
    })

    await logAuditEvent({
      action: 'optimizer_run.description_only_mutation',
      entityType: 'optimizer_run',
      entityId: id,
      details: {
        candidateId: candidate.id,
        versionId: newVersion.id,
        rationale: mutationResult.rationale,
      },
    })

    return NextResponse.json({
      candidateId: candidate.id,
      versionId: newVersion.id,
      rationale: mutationResult.rationale,
      mutations: mutationResult.mutations,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
