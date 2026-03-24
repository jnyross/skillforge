import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/eval-builder/sessions — list all eval builder sessions
 * POST /api/eval-builder/sessions — create a new session
 */

export async function GET() {
  const sessions = await prisma.evalBuilderSession.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      skillRepo: { select: { id: true, displayName: true, slug: true } },
      _count: { select: { messages: true } },
    },
  })
  return NextResponse.json(sessions)
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    skillRepoId?: string
    title?: string
  }

  const session = await prisma.evalBuilderSession.create({
    data: {
      skillRepoId: body.skillRepoId || null,
      title: body.title || '',
      phase: 'understanding',
      status: 'active',
    },
    include: {
      skillRepo: { select: { id: true, displayName: true, slug: true } },
    },
  })

  // Create the initial AI greeting message
  const greeting = getGreetingMessage(session.skillRepo?.displayName)

  await prisma.evalBuilderMessage.create({
    data: {
      sessionId: session.id,
      role: 'assistant',
      content: greeting,
    },
  })

  return NextResponse.json(session, { status: 201 })
}

function getGreetingMessage(repoName?: string | null): string {
  if (repoName) {
    return `Hi! I'm here to help you build evaluation tests for **${repoName}**.

To create great tests, I need to understand how this skill works. Let's start with a few questions:

1. **What does this skill do?** Describe it in your own words — even a rough description helps.
2. **When should it activate?** What kind of user requests should trigger this skill?

You can also paste any documentation, example inputs/outputs, or other knowledge you have about this skill. I'll analyze it and propose test cases for you.`
  }

  return `Hi! I'm the **Eval Builder** — I'll help you create evaluation tests for your Claude Code skills through a simple conversation.

No technical knowledge needed — just tell me about your skill and I'll do the heavy lifting.

**To get started, I need two things:**
1. Which skill would you like to build evals for? (You can pick an existing skill repo or describe a new one)
2. Any documentation, examples, or knowledge about how the skill should work

Let's begin — what skill are we building tests for?`
}
