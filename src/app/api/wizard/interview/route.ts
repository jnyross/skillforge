import { NextRequest, NextResponse } from 'next/server'
import {
  createInitialContext,
  processInterviewMessage,
  generateGreeting,
  computeIntentConfidence,
  type InterviewContext,
} from '@/lib/services/wizard/interview-service'

/**
 * POST /api/wizard/interview
 *
 * Processes a user message in the structured interview flow.
 * Body: { message: string, context: InterviewContext | null, mode: string }
 * Returns: { response: string, context: InterviewContext, extractedAnswer?: ExtractedAnswer }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      message?: string
      context?: InterviewContext | null
      mode?: string
      action?: string
    }

    const { message, mode = 'scratch', action } = body

    // Handle "start" action — initialize interview and return greeting
    if (action === 'start') {
      const context = createInitialContext(mode)
      const greeting = generateGreeting(mode)

      context.messages.push({
        role: 'assistant',
        content: greeting,
        timestamp: new Date().toISOString(),
      })

      return NextResponse.json({
        response: greeting,
        context,
      })
    }

    // Process user message
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 },
      )
    }

    let context: InterviewContext
    if (body.context) {
      context = body.context
    } else {
      context = createInitialContext(mode)
    }

    const result = await processInterviewMessage(message.trim(), context)

    // Compute intent confidence when reaching confirm state
    if (result.context.state === 'confirm' || result.context.state === 'done') {
      result.context.intentConfidence = computeIntentConfidence(result.context)
    }

    return NextResponse.json({
      response: result.response,
      context: result.context,
      extractedAnswer: result.extractedAnswer,
    })
  } catch (error) {
    console.error('Interview API error:', error)
    return NextResponse.json(
      { error: 'Failed to process interview message' },
      { status: 500 },
    )
  }
}
