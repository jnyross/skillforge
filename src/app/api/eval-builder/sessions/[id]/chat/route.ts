import { NextRequest, NextResponse } from 'next/server'
import { processMessage } from '@/lib/services/eval-builder/eval-builder-service'

/**
 * POST /api/eval-builder/sessions/:id/chat — send a message in the conversation
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as { message: string }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  try {
    const result = await processMessage(id, body.message.trim())
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chat processing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
