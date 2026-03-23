import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateSkillFromWizard, type WizardInput, type WizardArtifact, type WizardMode } from '@/lib/services/wizard/wizard-service'

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

  if (draft.status !== 'intake') {
    return NextResponse.json(
      { error: `Cannot generate from status "${draft.status}". Draft must be in "intake" status.` },
      { status: 400 }
    )
  }

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

    // Determine mode from artifacts
    let mode: WizardMode = 'scratch'

    // Check for conversation-type artifacts vs non-conversation artifacts
    const hasConversations = artifacts.some(a => a.type === 'other' && a.name.toLowerCase().includes('conversation'))
    const hasNonConversationArtifacts = artifacts.some(a => !(a.type === 'other' && a.name.toLowerCase().includes('conversation')))

    if (hasConversations && hasNonConversationArtifacts) {
      mode = 'hybrid'
    } else if (hasConversations) {
      mode = 'extract'
    } else if (hasNonConversationArtifacts) {
      mode = 'synthesize'
    }

    const input: WizardInput = {
      mode,
      intent: draft.intent,
      artifacts,
      conversations: artifacts
        .filter(a => a.type === 'other' && a.name.toLowerCase().includes('conversation'))
        .map(a => a.content),
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
        }),
      },
    })

    return NextResponse.json({
      draft: updated,
      generated: result,
    })
  } catch (err) {
    // Revert status on error
    await prisma.wizardDraft.update({
      where: { id: params.id },
      data: { status: 'intake' },
    })

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
