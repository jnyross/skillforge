import { NextRequest, NextResponse } from 'next/server'
import { updateCaseStatus } from '@/lib/services/eval-builder/eval-builder-service'
import type { ProposedCase } from '@/lib/services/eval-builder/eval-builder-service'

/**
 * PATCH /api/eval-builder/sessions/:id/cases/:caseId — update a proposed case
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseId: string }> }
) {
  const { id, caseId } = await params
  const body = await request.json() as {
    action: 'accept' | 'reject' | 'edit'
    edits?: Partial<ProposedCase>
  }

  if (!['accept', 'reject', 'edit'].includes(body.action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  try {
    const cases = await updateCaseStatus(id, caseId, body.action, body.edits)
    return NextResponse.json({ cases })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
