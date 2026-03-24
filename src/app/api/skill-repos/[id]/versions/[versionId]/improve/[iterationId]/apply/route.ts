import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { improveSkill } from '@/lib/services/improvement/skill-improver-service'
import type { ImprovementSuggestion } from '@/lib/services/improvement/analyzer-service'
import { createVersion, getFilesAtCommit } from '@/lib/services/git-storage'
import { estimateTokenCount, countLines } from '@/lib/services/skill-parser'

/**
 * POST /api/skill-repos/[id]/versions/[versionId]/improve/[iterationId]/apply
 * Applies accepted suggestions from an iteration to create a new version.
 *
 * Body: { acceptedIndices: number[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string; iterationId: string }> }
) {
  const { id: skillRepoId, versionId, iterationId } = await params

  const body = await request.json() as { acceptedIndices?: number[] }

  if (!body.acceptedIndices || body.acceptedIndices.length === 0) {
    return NextResponse.json(
      { error: 'acceptedIndices is required and must not be empty' },
      { status: 400 }
    )
  }

  // Load iteration
  const iteration = await prisma.improvementIteration.findUnique({
    where: { id: iterationId },
  })

  if (!iteration) {
    return NextResponse.json({ error: 'Iteration not found' }, { status: 404 })
  }

  if (iteration.skillRepoId !== skillRepoId || iteration.sourceVersionId !== versionId) {
    return NextResponse.json(
      { error: 'Iteration does not belong to this repo/version' },
      { status: 400 }
    )
  }

  if (iteration.status !== 'completed') {
    return NextResponse.json(
      { error: `Cannot apply suggestions: iteration is in '${iteration.status}' status` },
      { status: 400 }
    )
  }

  if (iteration.resultVersionId) {
    return NextResponse.json(
      { error: 'Suggestions have already been applied for this iteration' },
      { status: 409 }
    )
  }

  // Parse suggestions
  const allSuggestions = JSON.parse(iteration.suggestionsJson) as ImprovementSuggestion[]
  const acceptedSuggestions = body.acceptedIndices
    .filter(i => i >= 0 && i < allSuggestions.length)
    .map(i => allSuggestions[i])

  if (acceptedSuggestions.length === 0) {
    return NextResponse.json(
      { error: 'No valid suggestion indices provided' },
      { status: 400 }
    )
  }

  // Load skill repo and version
  const skillRepo = await prisma.skillRepo.findUniqueOrThrow({
    where: { id: skillRepoId },
  })

  const sourceVersion = await prisma.skillVersion.findUniqueOrThrow({
    where: { id: versionId },
  })

  // Read current files from git at this version's commit
  const currentFiles = await getFilesAtCommit(
    skillRepo.gitRepoPath,
    sourceVersion.gitCommitSha
  )

  const skillMdFile = currentFiles.find(f => f.path === 'SKILL.md')
  if (!skillMdFile) {
    return NextResponse.json(
      { error: 'Could not read SKILL.md from source version' },
      { status: 500 }
    )
  }

  // Additional files for context (exclude SKILL.md)
  const additionalFiles = currentFiles
    .filter(f => f.path !== 'SKILL.md')
    .map(f => ({ path: f.path, content: f.content }))

  // Apply improvements using the skill improver
  try {
    const improved = await improveSkill({
      currentSkillContent: skillMdFile.content,
      suggestions: acceptedSuggestions,
      additionalFiles,
    })

    // Build files array for commit — start with improved SKILL.md
    const newFiles = [
      {
        path: 'SKILL.md',
        content: improved.skillMd,
        size: improved.skillMd.length,
      },
    ]

    // Merge existing files with improved/new files
    const improvedPaths = new Set(improved.files.map(f => f.path))
    for (const existingFile of currentFiles) {
      if (existingFile.path === 'SKILL.md') continue
      if (improvedPaths.has(existingFile.path)) continue
      newFiles.push(existingFile)
    }

    // Add new/modified files from the improver
    for (const file of improved.files) {
      newFiles.push({
        path: file.path,
        content: file.content,
        size: file.content.length,
      })
    }

    // Create git commit
    const branch = sourceVersion.branchName || 'main'
    const commitSha = await createVersion(
      skillRepo.gitRepoPath,
      newFiles,
      improved.commitMessage,
      branch
    )

    // Create version record in DB
    const totalContent = newFiles.map(f => f.content).join('\n')
    const newVersion = await prisma.skillVersion.create({
      data: {
        skillRepoId,
        branchName: branch,
        gitCommitSha: commitSha,
        parentVersionId: versionId,
        commitMessage: improved.commitMessage,
        createdBy: 'improvement-agent',
        tokenCount: estimateTokenCount(totalContent),
        lineCount: countLines(totalContent),
        fileCount: newFiles.length,
        notes: `Auto-improved from iteration #${iteration.iterationNumber}: applied ${acceptedSuggestions.length} suggestion(s)`,
      },
    })

    // Update iteration with result version
    await prisma.improvementIteration.update({
      where: { id: iterationId },
      data: {
        resultVersionId: newVersion.id,
        acceptedIndices: JSON.stringify(body.acceptedIndices.filter(i => i >= 0 && i < allSuggestions.length)),
      },
    })

    return NextResponse.json(
      {
        newVersionId: newVersion.id,
        commitSha,
        commitMessage: improved.commitMessage,
        changesSummary: improved.changesSummary,
        filesModified: newFiles.length,
      },
      { status: 201 }
    )
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Failed to apply improvements: ${errorMsg}` },
      { status: 500 }
    )
  }
}
