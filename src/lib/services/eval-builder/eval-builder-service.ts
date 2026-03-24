/**
 * Eval Builder Service — AI-guided conversational eval creation.
 *
 * Manages a multi-phase conversation where the AI helps users
 * build ground truth eval suites from a knowledge corpus.
 *
 * Phases:
 * 1. Understanding — What does the skill do? Which repo?
 * 2. Corpus — User provides knowledge, examples, docs
 * 3. Analysis — AI identifies testable behaviors
 * 4. Generation — AI generates specific test cases
 * 5. Refinement — User feedback loop
 * 6. Committed — Cases saved to eval suites
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

export interface ProposedCase {
  id: string
  name: string
  prompt: string
  expectedOutcome: string
  type: 'trigger' | 'output'
  shouldTrigger?: boolean
  assertionType?: string
  assertionValue?: string
  split: 'train' | 'validation' | 'holdout'
  category: string
  status: 'proposed' | 'accepted' | 'rejected' | 'edited'
}

export interface AnalysisResult {
  skillDescription: string
  behaviors: string[]
  edgeCases: string[]
  failureModes: string[]
  categories: string[]
}

type SessionPhase = 'understanding' | 'corpus' | 'analysis' | 'generation' | 'refinement' | 'committed'

const SYSTEM_PROMPT = `You are SkillForge's AI Eval Builder — a friendly, expert guide that helps users create comprehensive evaluation suites for Claude Code skills. Your goal is to make eval creation accessible to users with zero technical knowledge.

You work through phases, but you should be natural and conversational — don't announce phases mechanically. Guide the user naturally through:

1. UNDERSTANDING: Learn what the skill does. Ask about:
   - What task does this skill help Claude perform?
   - When should it activate (trigger conditions)?
   - What does good output look like?
   - What are common mistakes or failure modes?

2. CORPUS INGESTION: Encourage the user to share knowledge:
   - "Paste any documentation, runbooks, or guides you have"
   - "Share some example inputs and what the ideal outputs should be"
   - "Tell me about times it went wrong — those make great test cases"
   - Accept any format: docs, examples, bullet points, free-form text

3. ANALYSIS: After receiving corpus, identify:
   - Core behaviors to test (what MUST work)
   - Edge cases (boundary conditions, unusual inputs)
   - Failure modes (what should NOT happen)
   - Test categories (trigger accuracy, output quality, safety, etc.)
   Present your analysis and ask for confirmation/additions.

4. GENERATION: Create specific test cases:
   - Generate trigger cases (should/shouldn't activate)
   - Generate output quality cases (with expected outcomes)
   - Assign train/validation/holdout splits (60/20/20)
   - Explain WHY each test case matters
   Present cases in a structured format for review.

5. REFINEMENT: Iterate based on feedback:
   - Accept edits to any proposed case
   - Add more cases in underrepresented categories
   - Remove cases the user finds irrelevant
   - Suggest improvements based on best practices

IMPORTANT RULES:
- Be conversational and encouraging. The user may not know eval terminology.
- Explain concepts simply when needed (e.g., "trigger tests check WHEN the skill should activate")
- When proposing test cases, use this JSON format embedded in your response:
  |||PROPOSED_CASES|||
  [{"name": "...", "prompt": "...", "expectedOutcome": "...", "type": "trigger|output", "shouldTrigger": true/false, "category": "...", "split": "train|validation|holdout"}]
  |||END_CASES|||
- When you've analyzed the corpus, output analysis in this format:
  |||ANALYSIS|||
  {"skillDescription": "...", "behaviors": [...], "edgeCases": [...], "failureModes": [...], "categories": [...]}
  |||END_ANALYSIS|||
- You can output both analysis and cases in the same message.
- Always generate at least 8-12 test cases covering: positive triggers, negative triggers, output quality, edge cases.
- Use the 60/20/20 split: most cases should be "train", some "validation", some "holdout".
- Keep your responses focused and not too long. Ask one or two questions at a time.
- If the user says something like "that's all" or "looks good", move to the next phase.
- When the user is satisfied with the cases, confirm you're ready to commit them.`

/**
 * Process a user message in the eval builder conversation.
 * Returns the AI response and any structured data (analysis, proposed cases).
 */
export async function processMessage(
  sessionId: string,
  userMessage: string
): Promise<{
  response: string
  analysis?: AnalysisResult
  proposedCases?: ProposedCase[]
  phase: SessionPhase
}> {
  // Load session with messages
  const session = await prisma.evalBuilderSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      skillRepo: true,
    },
  })

  if (!session) throw new Error('Session not found')

  // Save user message
  await prisma.evalBuilderMessage.create({
    data: {
      sessionId,
      role: 'user',
      content: userMessage,
    },
  })

  // Build conversation history for Claude
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  for (const msg of session.messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
    }
  }
  messages.push({ role: 'user', content: userMessage })

  // Add context about the current state
  let contextPrefix = ''
  if (session.skillRepo) {
    contextPrefix += `[Context: The user is building evals for the skill repo "${session.skillRepo.displayName}" (${session.skillRepo.description || 'no description'})]\n`
  }
  if (session.corpusText) {
    contextPrefix += `[Context: The user has provided a knowledge corpus (${session.corpusText.length} characters). It has been ingested.]\n`
  }

  const existingCases = JSON.parse(session.proposedCasesJson || '[]') as ProposedCase[]
  if (existingCases.length > 0) {
    const accepted = existingCases.filter(c => c.status === 'accepted').length
    const proposed = existingCases.filter(c => c.status === 'proposed').length
    contextPrefix += `[Context: ${existingCases.length} test cases exist (${accepted} accepted, ${proposed} pending review).]\n`
  }

  // Prepend context to the system prompt
  const fullSystemPrompt = SYSTEM_PROMPT + (contextPrefix ? `\n\nCURRENT SESSION CONTEXT:\n${contextPrefix}` : '')

  // Call Claude API
  const apiKey = process.env.ANTHROPIC_API_KEY
  let responseText: string

  if (apiKey) {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: fullSystemPrompt,
      messages,
    })
    responseText = response.content[0].type === 'text' ? response.content[0].text : ''
  } else {
    // Mock response for development without API key
    responseText = getMockResponse(session.phase, userMessage, existingCases)
  }

  // Parse structured data from response
  const analysis = extractAnalysis(responseText)
  const newCases = extractProposedCases(responseText)

  // Clean the response text (remove structured data markers)
  const cleanResponse = responseText
    .replace(/\|\|\|PROPOSED_CASES\|\|\|[\s\S]*?\|\|\|END_CASES\|\|\|/g, '')
    .replace(/\|\|\|ANALYSIS\|\|\|[\s\S]*?\|\|\|END_ANALYSIS\|\|\|/g, '')
    .trim()

  // Determine phase transition
  let newPhase = session.phase as SessionPhase
  if (analysis && newPhase === 'corpus') {
    newPhase = 'analysis'
  }
  if (newCases.length > 0 && (newPhase === 'analysis' || newPhase === 'corpus' || newPhase === 'understanding')) {
    newPhase = 'generation'
  }
  if (existingCases.length > 0 && newCases.length > 0) {
    newPhase = 'refinement'
  }

  // Check if user provided corpus text (look for long messages or explicit sharing)
  if (userMessage.length > 200 && session.phase === 'understanding') {
    newPhase = 'corpus'
    await prisma.evalBuilderSession.update({
      where: { id: sessionId },
      data: {
        corpusText: session.corpusText
          ? session.corpusText + '\n\n---\n\n' + userMessage
          : userMessage,
      },
    })
  }

  // Merge new cases with existing ones
  let allCases = [...existingCases]
  if (newCases.length > 0) {
    // Assign IDs to new cases
    const casesWithIds = newCases.map((c, i) => ({
      ...c,
      id: `case-${Date.now()}-${i}`,
      status: 'proposed' as const,
    }))
    allCases = [...allCases, ...casesWithIds]
  }

  // Save assistant response and update session
  await prisma.evalBuilderMessage.create({
    data: {
      sessionId,
      role: 'assistant',
      content: cleanResponse,
      metadata: JSON.stringify({
        ...(analysis ? { analysis } : {}),
        ...(newCases.length > 0 ? { newCasesCount: newCases.length } : {}),
      }),
    },
  })

  await prisma.evalBuilderSession.update({
    where: { id: sessionId },
    data: {
      phase: newPhase,
      ...(analysis ? { analysisJson: JSON.stringify(analysis) } : {}),
      ...(allCases.length > existingCases.length ? { proposedCasesJson: JSON.stringify(allCases) } : {}),
    },
  })

  return {
    response: cleanResponse,
    analysis: analysis || undefined,
    proposedCases: allCases.length > 0 ? allCases : undefined,
    phase: newPhase,
  }
}

/**
 * Commit accepted cases to eval suites.
 */
export async function commitCases(
  sessionId: string
): Promise<{ suiteIds: string[]; caseCount: number }> {
  const session = await prisma.evalBuilderSession.findUnique({
    where: { id: sessionId },
  })

  if (!session || !session.skillRepoId) {
    throw new Error('Session not found or no skill repo selected')
  }

  if (session.status === 'committed') {
    throw new Error('Session already committed')
  }

  const allCases = JSON.parse(session.proposedCasesJson || '[]') as ProposedCase[]
  const acceptedCases = allCases.filter(c => c.status === 'accepted' || c.status === 'edited')

  if (acceptedCases.length === 0) {
    throw new Error('No accepted cases to commit')
  }

  // Group cases by type
  const triggerCases = acceptedCases.filter(c => c.type === 'trigger')
  const outputCases = acceptedCases.filter(c => c.type === 'output')

  // Use a transaction to ensure atomic commit
  const result = await prisma.$transaction(async (tx) => {
    const suiteIds: string[] = []
    let totalCreated = 0

    // Create trigger suite if we have trigger cases
    if (triggerCases.length > 0) {
      const suiteName = `AI-Guided Trigger Suite — ${session.title || 'Untitled'} (${session.id.slice(0, 8)})`
      const suite = await tx.evalSuite.create({
        data: {
          skillRepoId: session.skillRepoId!,
          name: suiteName,
          type: 'trigger',
          description: 'Created by AI-guided eval builder',
        },
      })
      suiteIds.push(suite.id)

      for (let i = 0; i < triggerCases.length; i++) {
        const c = triggerCases[i]
        await tx.evalCase.create({
          data: {
            evalSuiteId: suite.id,
            key: `ai-guided-trigger-${i + 1}`,
            name: c.name,
            prompt: c.prompt,
            shouldTrigger: c.shouldTrigger ?? true,
            expectedOutcome: c.expectedOutcome,
            split: c.split,
            source: 'ai-guided',
            tags: c.category,
          },
        })
        totalCreated++
      }
    }

    // Create output suite if we have output cases
    if (outputCases.length > 0) {
      const suiteName = `AI-Guided Output Suite — ${session.title || 'Untitled'} (${session.id.slice(0, 8)})`
      const suite = await tx.evalSuite.create({
        data: {
          skillRepoId: session.skillRepoId!,
          name: suiteName,
          type: 'output',
          description: 'Created by AI-guided eval builder',
        },
      })
      suiteIds.push(suite.id)

      for (let i = 0; i < outputCases.length; i++) {
        const c = outputCases[i]
        await tx.evalCase.create({
          data: {
            evalSuiteId: suite.id,
            key: `ai-guided-output-${i + 1}`,
            name: c.name,
            prompt: c.prompt,
            expectedOutcome: c.expectedOutcome,
            split: c.split,
            source: 'ai-guided',
            tags: c.category,
            configJson: JSON.stringify({
              ...(c.assertionType ? { assertionType: c.assertionType } : {}),
              ...(c.assertionValue ? { assertionValue: c.assertionValue } : {}),
            }),
          },
        })
        totalCreated++
      }
    }

    // Update session
    await tx.evalBuilderSession.update({
      where: { id: sessionId },
      data: {
        phase: 'committed',
        status: 'committed',
        committedSuiteIds: suiteIds.join(','),
      },
    })

    return { suiteIds, caseCount: totalCreated }
  })

  return result
}

/**
 * Update the status of a proposed case (accept/reject/edit).
 */
export async function updateCaseStatus(
  sessionId: string,
  caseId: string,
  action: 'accept' | 'reject' | 'edit',
  edits?: Partial<ProposedCase>
): Promise<ProposedCase[]> {
  const session = await prisma.evalBuilderSession.findUnique({
    where: { id: sessionId },
  })

  if (!session) throw new Error('Session not found')

  const cases = JSON.parse(session.proposedCasesJson || '[]') as ProposedCase[]
  const idx = cases.findIndex(c => c.id === caseId)

  if (idx === -1) throw new Error('Case not found')

  if (action === 'accept') {
    cases[idx].status = 'accepted'
  } else if (action === 'reject') {
    cases[idx].status = 'rejected'
  } else if (action === 'edit' && edits) {
    cases[idx] = { ...cases[idx], ...edits, status: 'edited' }
  }

  await prisma.evalBuilderSession.update({
    where: { id: sessionId },
    data: { proposedCasesJson: JSON.stringify(cases) },
  })

  return cases
}

// --- Helper functions ---

function extractAnalysis(text: string): AnalysisResult | null {
  const match = text.match(/\|\|\|ANALYSIS\|\|\|([\s\S]*?)\|\|\|END_ANALYSIS\|\|\|/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim()) as AnalysisResult
  } catch {
    return null
  }
}

function extractProposedCases(text: string): Omit<ProposedCase, 'id' | 'status'>[] {
  const match = text.match(/\|\|\|PROPOSED_CASES\|\|\|([\s\S]*?)\|\|\|END_CASES\|\|\|/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[1].trim()) as Array<{
      name?: string
      prompt?: string
      expectedOutcome?: string
      type?: string
      shouldTrigger?: boolean
      assertionType?: string
      assertionValue?: string
      category?: string
      split?: string
    }>
    return parsed.map(c => ({
      name: c.name || 'Untitled case',
      prompt: c.prompt || '',
      expectedOutcome: c.expectedOutcome || '',
      type: (c.type === 'trigger' ? 'trigger' : 'output') as 'trigger' | 'output',
      shouldTrigger: c.shouldTrigger,
      assertionType: c.assertionType,
      assertionValue: c.assertionValue,
      split: (['train', 'validation', 'holdout'].includes(c.split || '') ? c.split : 'train') as 'train' | 'validation' | 'holdout',
      category: c.category || 'general',
    }))
  } catch {
    return []
  }
}

function getMockResponse(phase: string, userMessage: string, existingCases: ProposedCase[]): string {
  if (phase === 'understanding' && userMessage.length < 200) {
    return `Thanks for telling me about your skill! To build great evals, I need to understand the expected behavior deeply.

Could you share some knowledge that describes how this skill should work? This could be:
- **Documentation or runbooks** — paste any relevant docs
- **Example inputs and outputs** — show me what good looks like  
- **Common mistakes** — what goes wrong when the skill fails?

Just paste the content right here and I'll analyze it to build test cases.`
  }

  if (phase === 'understanding' || phase === 'corpus') {
    return `Great, I've analyzed the information you provided. Here's what I identified:

|||ANALYSIS|||
{"skillDescription": "Based on the provided information", "behaviors": ["Core behavior 1", "Core behavior 2"], "edgeCases": ["Edge case 1"], "failureModes": ["Failure mode 1"], "categories": ["trigger-accuracy", "output-quality", "edge-cases"]}
|||END_ANALYSIS|||

I found several testable behaviors. Let me generate some test cases for you:

|||PROPOSED_CASES|||
[
  {"name": "Should trigger on basic request", "prompt": "Example trigger prompt", "expectedOutcome": "Skill activates correctly", "type": "trigger", "shouldTrigger": true, "category": "trigger-accuracy", "split": "train"},
  {"name": "Should NOT trigger on unrelated request", "prompt": "What is the weather today?", "expectedOutcome": "Skill should not activate", "type": "trigger", "shouldTrigger": false, "category": "trigger-accuracy", "split": "train"},
  {"name": "Output quality - basic case", "prompt": "Example output prompt", "expectedOutcome": "Produces correct, complete output", "type": "output", "category": "output-quality", "split": "train"},
  {"name": "Edge case handling", "prompt": "Edge case prompt", "expectedOutcome": "Handles gracefully", "type": "output", "category": "edge-cases", "split": "validation"}
]
|||END_CASES|||

Here are 4 initial test cases. Review them and let me know:
- **Accept** cases that look good
- **Reject** cases that aren't relevant
- **Edit** any case to improve it
- Ask me to **generate more** cases in any category

What do you think?`
  }

  if (existingCases.length > 0) {
    return `I've noted your feedback. The test cases have been updated.

Would you like me to:
1. Generate more test cases in a specific category?
2. Review the current set one more time?
3. Commit the accepted cases to your eval suites?

Just let me know!`
  }

  return `I understand. Let me know how you'd like to proceed — I'm here to help build the best possible eval suite for your skill.`
}
