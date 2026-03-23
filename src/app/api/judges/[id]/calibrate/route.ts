import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { promptVersionId } = body

  const judge = await prisma.judgeDefinition.findUnique({
    where: { id: params.id },
    include: { promptVersions: true },
  })

  if (!judge) {
    return NextResponse.json({ error: 'Judge not found' }, { status: 404 })
  }

  const promptVersion = promptVersionId
    ? judge.promptVersions.find(pv => pv.id === promptVersionId)
    : judge.promptVersions.find(pv => pv.active)

  if (!promptVersion) {
    return NextResponse.json({ error: 'No active prompt version found' }, { status: 400 })
  }

  const exampleCount = await prisma.judgeExample.count({
    where: { judgeId: params.id },
  })

  if (exampleCount === 0) {
    return NextResponse.json(
      { error: 'No calibration examples found. Add labeled examples first.' },
      { status: 400 }
    )
  }

  const calibrationRun = await prisma.judgeCalibrationRun.create({
    data: {
      judgeId: params.id,
      promptVersionId: promptVersion.id,
      status: 'pending',
      totalExamples: exampleCount,
    },
  })

  return NextResponse.json(calibrationRun, { status: 201 })
}
