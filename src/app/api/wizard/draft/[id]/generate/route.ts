import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateSkillFromWizard, type WizardInput, type WizardArtifact, type WizardMode, type FreedomLevel } from '@/lib/services/wizard/wizard-service'

/**
 * POST /api/wizard/draft/:id/generate
 * Generate a skill from wizard draft input using the Anthropic API (or mock fallback).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const draft = await prisma.wizardDraft.findUnique({
    where: { id: params.id },
  })

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (draft.status !== 'intake' && draft.status !== 'review') {
    return NextResponse.json(
      { error: `Cannot generate from status "${draft.status}". Draft must be in "intake" or "review" status.` },
      { status: 400 }
    )
  }

  const originalStatus = draft.status

  // Update status to generating
  await prisma.wizardDraft.update({
    where: { id: params.id },
    data: { status: 'generating' },
  })

  try {
    // Parse artifacts from stored JSON
    let artifacts: WizardArtifact[] = []
    try {
      const parsed = JSON.parse(draft.artifactsJson)
      if (Array.isArray(parsed)) {
        artifacts = parsed as WizardArtifact[]
      }
    } catch {
      // Empty artifacts is fine
    }

    // Use the mode stored in the draft (selected by the user in the UI)
    const mode: WizardMode = (['extract', 'synthesize', 'hybrid', 'scratch'].includes(draft.mode)
      ? draft.mode
      : 'scratch') as WizardMode

    // Parse advanced config options
    let config: Record<string, unknown> = {}
    try {
      config = JSON.parse(draft.configJson || '{}')
    } catch {
      // Ignore parse errors
    }

    // Parse concrete examples
    let concreteExamples: string[] = []
    try {
      const parsed = JSON.parse(draft.concreteExamples)
      if (Array.isArray(parsed)) concreteExamples = parsed
    } catch {
      // ignore
    }

    const freedomLevel: FreedomLevel = (['high', 'medium', 'low'].includes(draft.freedomLevel)
      ? draft.freedomLevel : 'medium') as FreedomLevel

    // Parse interview extracted answers
    let extractedAnswers: Array<{ questionKey: string; answer: string; confidence: string }> = []
    try {
      const parsed = JSON.parse(draft.extractedAnswersJson || '[]')
      if (Array.isArray(parsed)) extractedAnswers = parsed
    } catch {
      // ignore
    }

    const input: WizardInput = {
      mode,
      intent: draft.intent,
      artifacts,
      concreteExamples,
      freedomLevel,
      conversations: artifacts
        .filter(a => a.type === 'other' && a.name.toLowerCase().includes('conversation'))
        .map(a => a.content),
      corrections: Array.isArray(config.corrections) ? config.corrections as string[] : undefined,
      desiredOutputFormat: typeof config.desiredOutputFormat === 'string' ? config.desiredOutputFormat : undefined,
      safetyConstraints: typeof config.safetyConstraints === 'string' ? config.safetyConstraints : undefined,
      allowedTools: Array.isArray(config.allowedTools) ? config.allowedTools as string[] : undefined,
      interviewTranscript: draft.interviewTranscript || undefined,
      extractedAnswers: extractedAnswers.length > 0 ? extractedAnswers : undefined,
    }

    const result = await generateSkillFromWizard(input)

    // Store generated result in draft
    const updated = await prisma.wizardDraft.update({
      where: { id: params.id },
      data: {
        status: 'review',
        generatedSkill: result.skillMd,
          generatedEvals: JSON.stringify({
            triggerSuite: result.triggerSuite,
            outputSuite: result.outputSuite,
            smokePlan: result.smokePlan,
            warnings: result.warnings,
            files: result.files,
            qualityScore: result.qualityScore,
            qualityIssues: result.qualityIssues,
            reviewScore: result.reviewScore,
            reviewFeedback: result.reviewFeedback,
          }),
      },
    })

    return NextResponse.json({
      draft: updated,
      generated: result,
    })
  } catch (err) {
    // Revert status on error to original state
    await prisma.wizardDraft.update({
      where: { id: params.id },
      data: { status: originalStatus },
    })

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
