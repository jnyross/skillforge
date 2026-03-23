import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const draft = await prisma.wizardDraft.findUnique({
    where: { id: params.id },
  })

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  return NextResponse.json(draft)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { intent, artifactsJson, mode, configJson, status, generatedSkill, generatedEvals, smokeResultJson, savedVersionId, savedRepoId } = body

  const existing = await prisma.wizardDraft.findUnique({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const updated = await prisma.wizardDraft.update({
    where: { id: params.id },
    data: {
      ...(intent !== undefined && { intent }),
      ...(artifactsJson !== undefined && { artifactsJson: JSON.stringify(artifactsJson) }),
      ...(mode !== undefined && { mode }),
      ...(configJson !== undefined && { configJson: typeof configJson === 'string' ? configJson : JSON.stringify(configJson) }),
      ...(status !== undefined && { status }),
      ...(generatedSkill !== undefined && { generatedSkill }),
      ...(generatedEvals !== undefined && { generatedEvals: JSON.stringify(generatedEvals) }),
      ...(smokeResultJson !== undefined && { smokeResultJson: JSON.stringify(smokeResultJson) }),
      ...(savedVersionId !== undefined && { savedVersionId }),
      ...(savedRepoId !== undefined && { savedRepoId }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = await prisma.wizardDraft.findUnique({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  await prisma.wizardDraft.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
