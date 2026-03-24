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

  // Accept configJson directly from the body (interview flow sends it as a string),
  // or build it from individual fields (form flow sends them separately)
  let configJson: Record<string, unknown> = {}
  const bodyConfigJson = body.configJson
  if (typeof bodyConfigJson === 'string' && bodyConfigJson.trim()) {
    try { configJson = JSON.parse(bodyConfigJson) } catch { /* ignore */ }
  } else if (bodyConfigJson && typeof bodyConfigJson === 'object') {
    configJson = bodyConfigJson
  }
  // Overlay individual fields on top (form flow)
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
