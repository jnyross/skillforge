import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCalibration } from '@/lib/services/judge/calibration-service'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { promptVersionId } = body

  const judge = await prisma.judgeDefinition.findUnique({
    where: { id: params.id },
    include: {
      promptVersions: true,
      examples: true,
    },
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

  const validationExamples = judge.examples.filter(e => e.split === 'validation')
  if (validationExamples.length === 0) {
    return NextResponse.json(
      { error: 'No validation examples found. Add examples with split="validation" first.' },
      { status: 400 }
    )
  }

  const calibrationRun = await prisma.judgeCalibrationRun.create({
    data: {
      judgeId: params.id,
      promptVersionId: promptVersion.id,
      status: 'running',
      totalExamples: validationExamples.length,
    },
  })

  // Run calibration asynchronously — fire and forget
  runCalibration(calibrationRun.id, judge, promptVersion, validationExamples)
    .catch(async (err) => {
      await prisma.judgeCalibrationRun.update({
        where: { id: calibrationRun.id },
        data: {
          status: 'failed',
          metricsJson: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          completedAt: new Date(),
        },
      })
    })

  return NextResponse.json(calibrationRun, { status: 201 })
}
