import { NextRequest, NextResponse } from 'next/server'
import { commitCases } from '@/lib/services/eval-builder/eval-builder-service'

/**
 * POST /api/eval-builder/sessions/:id/commit — commit accepted cases to eval suites
 */

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const result = await commitCases(id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Commit failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
