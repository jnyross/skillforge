import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const drafts = await prisma.wizardDraft.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(drafts)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { intent, artifactsJson, mode, corrections, desiredOutputFormat, safetyConstraints, allowedTools, concreteExamples, freedomLevel, interviewTranscript, extractedAnswersJson, interviewContextJson } = body

  const configJson: Record<string, unknown> = {}
  if (corrections && Array.isArray(corrections) && corrections.length > 0) configJson.corrections = corrections
  if (desiredOutputFormat) configJson.desiredOutputFormat = desiredOutputFormat
  if (safetyConstraints) configJson.safetyConstraints = safetyConstraints
  if (allowedTools && Array.isArray(allowedTools) && allowedTools.length > 0) configJson.allowedTools = allowedTools

  const draft = await prisma.wizardDraft.create({
    data: {
      intent: intent || '',
      mode: mode || 'scratch',
      artifactsJson: artifactsJson ? JSON.stringify(artifactsJson) : '[]',
      configJson: JSON.stringify(configJson),
      concreteExamples: concreteExamples || '[]',
      freedomLevel: freedomLevel || 'medium',
      interviewTranscript: interviewTranscript || '',
      extractedAnswersJson: extractedAnswersJson || '[]',
      interviewContextJson: interviewContextJson || '',
      status: 'intake',
    },
  })

  return NextResponse.json(draft, { status: 201 })
}
