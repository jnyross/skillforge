import { NextRequest, NextResponse } from 'next/server'
import { generateEvalCasesFromCategories } from '@/lib/services/error-analysis/error-analysis-service'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const { targetSuiteId } = body

  if (!targetSuiteId) {
    return NextResponse.json({ error: 'targetSuiteId is required' }, { status: 400 })
  }

  try {
    const result = await generateEvalCasesFromCategories(params.id, targetSuiteId)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
