/**
 * Interview Service — Structured 4-question interview with state machine.
 *
 * This replaces the form-based intake with a conversational flow that matches
 * skill-creator's interview methodology, then EXCEEDS it with:
 * - Visual answer cards with confidence indicators
 * - Technical level detection and adaptive language
 * - Persistent draft state for resume capability
 * - Proactive follow-up questions for incomplete answers
 */

import Anthropic from '@anthropic-ai/sdk'

// ─── State Machine ──────────────────────────────────────────────────────────

export type InterviewState =
  | 'greeting'
  | 'q1_capability'
  | 'q1_followup'
  | 'q2_trigger'
  | 'q2_followup'
  | 'q3_format'
  | 'q3_followup'
  | 'q4_testing'
  | 'edge_cases'
  | 'confirm'
  | 'done'

export type TechLevel = 'beginner' | 'intermediate' | 'expert'

export interface TechLevelProfile {
  level: TechLevel
  signals: string[]
  vocabulary: {
    useJargon: boolean
    useAbbreviations: boolean
    useCodeTerms: boolean
  }
}

export interface ExtractedAnswer {
  questionKey: 'capability' | 'trigger' | 'format' | 'testing' | 'edge_cases'
  answer: string
  confidence: 'high' | 'medium' | 'low'
  needsFollowUp: boolean
  followUpReason?: string
}

export interface InterviewMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface IntentConfidenceScore {
  overall: number // 0-100
  dimensions: {
    clarity: number // How clearly the user expressed their intent
    completeness: number // How many key aspects were covered
    specificity: number // How specific (vs vague) the answers are
    consistency: number // Whether answers are consistent with each other
  }
  summary: string // Human-readable summary of confidence
}

export interface InterviewContext {
  state: InterviewState
  messages: InterviewMessage[]
  extractedAnswers: ExtractedAnswer[]
  techLevel: TechLevelProfile | null
  mode: string
  followUpCount: number // Track follow-ups to avoid infinite loops
  /** Whether expertise was locked in (after first 2 user messages) */
  expertiseLocked: boolean
  /** Intent confidence score — computed at confirm stage */
  intentConfidence: IntentConfidenceScore | null
}

// ─── Question Definitions ───────────────────────────────────────────────────

interface QuestionDef {
  key: ExtractedAnswer['questionKey']
  label: string
  shortLabel: string
}

export const INTERVIEW_QUESTIONS: QuestionDef[] = [
  {
    key: 'capability',
    label: 'What should this skill enable Claude to do?',
    shortLabel: 'Capability',
  },
  {
    key: 'format',
    label: "What's the expected output format?",
    shortLabel: 'Output Format',
  },
  {
    key: 'testing',
    label: 'Should we set up test cases for this skill?',
    shortLabel: 'Testing',
  },
  {
    key: 'edge_cases',
    label: 'What edge cases or tricky scenarios should this skill handle?',
    shortLabel: 'Edge Cases',
  },
  {
    key: 'trigger',
    label: 'When should this skill trigger? What would a user say?',
    shortLabel: 'Trigger',
  },
]

// ─── Tech Level Detection ───────────────────────────────────────────────────

const EXPERT_SIGNALS = [
  /\b(regex|regexp)\b/i,
  /\b(api|sdk|cli|ci\/cd|rest|graphql)\b/i,
  /\b(docker|kubernetes|k8s)\b/i,
  /\b(typescript|python|rust|golang)\b/i,
  /\b(ast|llm|rag|embeddings?|vector)\b/i,
  /\b(eval|benchmark|assertion|grading)\b/i,
  /\b(SKILL\.md|frontmatter|yaml)\b/i,
  /\b(git|branch|commit|merge|rebase)\b/i,
  /\b(prompt engineering|few-shot|chain.of.thought)\b/i,
  /\b(refactor|linter?|type.?check)\b/i,
]

const INTERMEDIATE_SIGNALS = [
  /\b(code|script|function|variable)\b/i,
  /\b(file|folder|directory|path)\b/i,
  /\b(database|sql|query)\b/i,
  /\b(deploy|server|endpoint)\b/i,
  /\b(test|debug|error|exception)\b/i,
  /\b(json|xml|csv|markdown)\b/i,
  /\b(automate|workflow|pipeline)\b/i,
]

export function detectTechLevel(messages: string[]): TechLevelProfile {
  const combined = messages.join(' ')
  const expertHits = EXPERT_SIGNALS.filter(r => r.test(combined)).map(r => r.source)
  const intermediateHits = INTERMEDIATE_SIGNALS.filter(r => r.test(combined)).map(r => r.source)

  const hasCodeBlocks = /```[\s\S]*?```/.test(combined)
  const hasInlineCode = /`[^`]+`/.test(combined)

  let level: TechLevel = 'beginner'
  const signals: string[] = []

  if (expertHits.length >= 2 || (expertHits.length >= 1 && hasCodeBlocks)) {
    level = 'expert'
    signals.push(...expertHits.slice(0, 3))
    if (hasCodeBlocks) signals.push('code blocks')
  } else if (intermediateHits.length >= 2 || expertHits.length >= 1 || hasInlineCode) {
    level = 'intermediate'
    signals.push(...intermediateHits.slice(0, 3))
    if (hasInlineCode) signals.push('inline code')
  } else {
    signals.push('general language')
  }

  return {
    level,
    signals,
    vocabulary: {
      useJargon: level === 'expert',
      useAbbreviations: level !== 'beginner',
      useCodeTerms: level !== 'beginner',
    },
  }
}

// ─── Adaptive Language ──────────────────────────────────────────────────────

export function getAdaptiveTerms(level: TechLevel): Record<string, string> {
  if (level === 'expert') {
    return {
      evalTerm: 'evaluation suite',
      triggerTerm: 'trigger condition',
      assertionTerm: 'assertion',
      skillTerm: 'SKILL.md',
      testTerm: 'eval cases',
      passRate: 'pass rate',
      baseline: 'baseline',
      blindComparison: 'blind comparison',
      iteration: 'iteration',
      triggerDescription: 'trigger description',
      evalSuite: 'eval suite',
      evalCase: 'eval case',
      skillVersion: 'version',
      analyzer: 'analyzer',
      improver: 'improver',
      qualityGate: 'quality gate',
      rubric: 'rubric',
      delta: 'delta',
      suggestion: 'suggestion',
      falsePositive: 'false positive',
      falseNegative: 'false negative',
    }
  }
  if (level === 'intermediate') {
    return {
      evalTerm: 'test suite',
      triggerTerm: 'activation phrase',
      assertionTerm: 'check',
      skillTerm: 'skill file',
      testTerm: 'test cases',
      passRate: 'success rate',
      baseline: 'reference version',
      blindComparison: 'blind comparison',
      iteration: 'improvement cycle',
      triggerDescription: 'activation text',
      evalSuite: 'test suite',
      evalCase: 'test case',
      skillVersion: 'version',
      analyzer: 'analysis engine',
      improver: 'improvement engine',
      qualityGate: 'quality check',
      rubric: 'scoring criteria',
      delta: 'score difference',
      suggestion: 'suggestion',
      falsePositive: 'wrong activation',
      falseNegative: 'missed activation',
    }
  }
  return {
    evalTerm: 'quality checks',
    triggerTerm: 'when to activate',
    assertionTerm: 'quality check',
    skillTerm: 'skill',
    testTerm: 'test examples',
    passRate: 'success rate',
    baseline: 'original version',
    blindComparison: 'side-by-side comparison',
    iteration: 'improvement round',
    triggerDescription: 'activation description',
    evalSuite: 'test collection',
    evalCase: 'test example',
    skillVersion: 'saved version',
    analyzer: 'analyzer',
    improver: 'improver',
    qualityGate: 'quality check',
    rubric: 'scoring guide',
    delta: 'score change',
    suggestion: 'recommendation',
    falsePositive: 'accidental activation',
    falseNegative: 'missed activation',
  }
}

// ─── Context Extraction ──────────────────────────────────────────────────────

/**
 * Extract answers from a user's initial message if they provide a lot of context upfront.
 * Uses LLM to detect if the user already described capability, triggers, etc.
 */
export async function extractFromContext(
  userMessage: string,
): Promise<{
  extractedAnswers: ExtractedAnswer[]
  suggestedSkips: string[]
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || userMessage.length < 100) {
    return { extractedAnswers: [], suggestedSkips: [] }
  }

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analyze this user message and extract any answers to these interview questions:
1. capability: What should this skill enable Claude to do?
2. trigger: When should this skill trigger? What would a user say?
3. format: What's the expected output format?
4. testing: Should we set up test cases?
5. edge_cases: What edge cases should this skill handle?

User message:
${userMessage}

Respond with JSON:
{
  "extractions": [
    {
      "questionKey": "capability" | "trigger" | "format" | "testing" | "edge_cases",
      "answer": "extracted answer text",
      "confidence": "high" | "medium" | "low"
    }
  ]
}

Only include questions where you found a clear answer. Be conservative — only extract if the user explicitly addressed the topic. Respond ONLY with valid JSON.`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        extractions?: Array<{
          questionKey?: string
          answer?: string
          confidence?: string
        }>
      }

      const validKeys = ['capability', 'trigger', 'format', 'testing', 'edge_cases']
      const extractedAnswers: ExtractedAnswer[] = (parsed.extractions || [])
        .filter(e => e.questionKey && validKeys.includes(e.questionKey) && e.answer)
        .map(e => ({
          questionKey: e.questionKey as ExtractedAnswer['questionKey'],
          answer: e.answer!,
          confidence: (e.confidence || 'medium') as 'high' | 'medium' | 'low',
          needsFollowUp: e.confidence !== 'high',
        }))

      const suggestedSkips = extractedAnswers
        .filter(a => a.confidence === 'high')
        .map(a => a.questionKey)

      return { extractedAnswers, suggestedSkips }
    }
  } catch {
    // Fall through
  }

  return { extractedAnswers: [], suggestedSkips: [] }
}

// ─── Interview Engine ───────────────────────────────────────────────────────

export function createInitialContext(mode: string): InterviewContext {
  return {
    state: 'greeting',
    messages: [],
    extractedAnswers: [],
    techLevel: null,
    mode,
    followUpCount: 0,
    expertiseLocked: false,
    intentConfidence: null,
  }
}

export function getQuestionNumber(state: InterviewState): number {
  switch (state) {
    case 'greeting':
    case 'q1_capability':
    case 'q1_followup':
      return 1
    case 'q3_format':
    case 'q3_followup':
      return 2
    case 'q4_testing':
      return 3
    case 'edge_cases':
      return 4
    case 'q2_trigger':
    case 'q2_followup':
      return 5
    case 'confirm':
    case 'done':
      return 5
    default:
      return 1
  }
}

export function getTotalQuestions(): number {
  return 5
}

/**
 * Process a user message and return the next assistant response + updated context.
 */
export async function processInterviewMessage(
  userMessage: string,
  context: InterviewContext,
): Promise<{ response: string; context: InterviewContext; extractedAnswer?: ExtractedAnswer }> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  // Detect tech level from user's first 2 messages, then lock it in
  let updatedContext = { ...context }
  const userMessages = [...context.messages.filter(m => m.role === 'user').map(m => m.content), userMessage]

  if (!updatedContext.expertiseLocked) {
    updatedContext.techLevel = detectTechLevel(userMessages)
    // Lock expertise after 2 user messages
    if (userMessages.length >= 2) {
      updatedContext.expertiseLocked = true
    }
  }

  // Add user message to history
  updatedContext.messages = [
    ...updatedContext.messages,
    { role: 'user' as const, content: userMessage, timestamp: new Date().toISOString() },
  ]

  const terms = getAdaptiveTerms(updatedContext.techLevel?.level || 'intermediate')

  // Handle state transitions
  if (updatedContext.state === 'greeting') {
    updatedContext.state = 'q1_capability'

    // If the user's first message is verbose (>100 chars), try to extract answers upfront
    if (apiKey && userMessage.length > 100) {
      const { extractedAnswers, suggestedSkips } = await extractFromContext(userMessage)
      if (extractedAnswers.length > 0) {
        // Merge extracted answers into context
        for (const extracted of extractedAnswers) {
          const existingIdx = updatedContext.extractedAnswers.findIndex(
            a => a.questionKey === extracted.questionKey
          )
          if (existingIdx >= 0) {
            updatedContext.extractedAnswers[existingIdx] = extracted
          } else {
            updatedContext.extractedAnswers.push(extracted)
          }
        }

        // Skip questions that were answered with high confidence
        // New order: capability → format → testing → edge_cases → trigger
        if (suggestedSkips.includes('capability')) {
          updatedContext.state = suggestedSkips.includes('format') ? 'q4_testing' : 'q3_format'
        }
      }
    }
  }

  // Use LLM to extract answer and generate response if API key available
  if (apiKey) {
    return processWithLLM(userMessage, updatedContext, terms, apiKey)
  }

  // Fallback: simple state machine without LLM
  return processWithoutLLM(userMessage, updatedContext, terms)
}

async function processWithLLM(
  userMessage: string,
  context: InterviewContext,
  terms: Record<string, string>,
  apiKey: string,
): Promise<{ response: string; context: InterviewContext; extractedAnswer?: ExtractedAnswer }> {
  const client = new Anthropic({ apiKey })
  const techLevel = context.techLevel?.level || 'intermediate'

  const currentQuestion = getCurrentQuestionKey(context.state)

  const systemPrompt = `You are SkillForge's interview assistant, helping users create Claude Code skills through a structured 5-question interview.

CURRENT STATE: ${context.state}
USER TECH LEVEL: ${techLevel}
LANGUAGE STYLE: ${techLevel === 'expert' ? 'Use technical jargon freely. Be concise.' : techLevel === 'intermediate' ? 'Use some technical terms but explain advanced concepts briefly.' : 'Use simple, friendly language. Avoid jargon. Explain concepts as you introduce them.'}

YOUR ROLE:
1. Extract the answer to the current question from the user's message
2. Assess if the answer is complete (high confidence) or needs follow-up (low/medium confidence)
3. Generate a natural, conversational response

VOCABULARY TO USE:
- ${terms.evalTerm} (not "evaluation suite" for beginners)
- ${terms.triggerTerm} (not "trigger condition" for beginners)
- ${terms.testTerm} (not "eval cases" for beginners)

RULES:
- Be conversational but efficient — don't pad with unnecessary pleasantries
- If the answer is vague, ask ONE specific follow-up question
- If the answer is good, acknowledge briefly and move to the next question
- Never ask more than 1 follow-up per question (max 2 messages per question)
- Show you understood by briefly reflecting back key points

Respond with a JSON object:
{
  "response": "your conversational message to the user",
  "extractedAnswer": "the extracted answer text (clean, structured summary of what the user said)",
  "confidence": "high" | "medium" | "low",
  "needsFollowUp": true | false,
  "followUpReason": "why follow-up is needed (only if needsFollowUp=true)",
  "nextState": "the next interview state to transition to"
}

VALID NEXT STATES based on current state (trigger is asked LAST):
- q1_capability → q1_followup (if answer is vague) OR q3_format (if answer is good)
- q1_followup → q3_format (always move on after follow-up)
- q3_format → q3_followup (if vague) OR q4_testing (if good)
- q3_followup → q4_testing (always move on)
- q4_testing → edge_cases (always)
- edge_cases → q2_trigger (always — trigger is the final question)
- q2_trigger → q2_followup (if only 1 example given) OR confirm (if good)
- q2_followup → confirm (always move on)

CURRENT QUESTION: ${getQuestionPromptForState(context.state, terms, techLevel)}

Previously extracted answers:
${context.extractedAnswers.map(a => `- ${a.questionKey}: ${a.answer}`).join('\n') || '(none yet)'}

IMPORTANT: Respond ONLY with valid JSON. No markdown, no extra text.`

  // Filter out leading assistant messages — Anthropic API requires first message to be 'user' role.
  // The greeting is always pushed as an assistant message before the first user message.
  const conversationMessages = context.messages
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
    .reduce<Array<{role: 'user' | 'assistant'; content: string}>>((acc, msg) => {
      if (acc.length === 0 && msg.role === 'assistant') return acc
      return [...acc, msg]
    }, [])

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversationMessages,
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        response?: string
        extractedAnswer?: string
        confidence?: string
        needsFollowUp?: boolean
        followUpReason?: string
        nextState?: string
      }

      const confidence = (parsed.confidence || 'medium') as 'high' | 'medium' | 'low'
      const needsFollowUp = parsed.needsFollowUp ?? false

      let extractedAnswer: ExtractedAnswer | undefined
      if (parsed.extractedAnswer && currentQuestion) {
        extractedAnswer = {
          questionKey: currentQuestion,
          answer: parsed.extractedAnswer,
          confidence,
          needsFollowUp,
          followUpReason: parsed.followUpReason,
        }

        // Update or add extracted answer — but don't overwrite high-confidence
        // pre-extractions from extractFromContext
        const existingIdx = context.extractedAnswers.findIndex(a => a.questionKey === currentQuestion)
        if (existingIdx >= 0) {
          const existing = context.extractedAnswers[existingIdx]
          // Only overwrite if the existing answer isn't already high-confidence
          if (existing.confidence !== 'high' || confidence === 'high') {
            context.extractedAnswers[existingIdx] = extractedAnswer
          }
        } else {
          context.extractedAnswers.push(extractedAnswer)
        }
      }

      // Determine next state
      let nextState = context.state
      if (parsed.nextState && isValidState(parsed.nextState)) {
        nextState = parsed.nextState as InterviewState
      } else {
        nextState = getDefaultNextState(context.state, needsFollowUp, context.followUpCount)
      }

      // Track follow-ups
      if (nextState.includes('followup')) {
        context.followUpCount++
      }

      const assistantMessage = parsed.response || generateFallbackResponse(nextState, terms, techLevel)

      context.state = nextState
      context.messages.push({
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date().toISOString(),
      })

      return { response: assistantMessage, context, extractedAnswer }
    }
  } catch {
    // Fall through to non-LLM processing
  }

  return processWithoutLLM(userMessage, context, terms)
}

function processWithoutLLM(
  userMessage: string,
  context: InterviewContext,
  terms: Record<string, string>,
): { response: string; context: InterviewContext; extractedAnswer?: ExtractedAnswer } {
  const currentQuestion = getCurrentQuestionKey(context.state)
  let extractedAnswer: ExtractedAnswer | undefined

  if (currentQuestion) {
    // Simple extraction: use the user's message as the answer
    const confidence: 'high' | 'medium' | 'low' = userMessage.length > 50 ? 'high' : userMessage.length > 20 ? 'medium' : 'low'
    extractedAnswer = {
      questionKey: currentQuestion,
      answer: userMessage,
      confidence,
      needsFollowUp: false,
    }

    const existingIdx = context.extractedAnswers.findIndex(a => a.questionKey === currentQuestion)
    if (existingIdx >= 0) {
      context.extractedAnswers[existingIdx] = extractedAnswer
    } else {
      context.extractedAnswers.push(extractedAnswer)
    }
  }

  // Simple state transitions — always move forward
  const nextState = getDefaultNextState(context.state, false, context.followUpCount)
  context.state = nextState

  const response = generateFallbackResponse(nextState, terms, context.techLevel?.level)
  context.messages.push({
    role: 'assistant',
    content: response,
    timestamp: new Date().toISOString(),
  })

  return { response, context, extractedAnswer }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCurrentQuestionKey(state: InterviewState): ExtractedAnswer['questionKey'] | null {
  switch (state) {
    case 'q1_capability':
    case 'q1_followup':
      return 'capability'
    case 'q2_trigger':
    case 'q2_followup':
      return 'trigger'
    case 'q3_format':
    case 'q3_followup':
      return 'format'
    case 'q4_testing':
      return 'testing'
    case 'edge_cases':
      return 'edge_cases'
    default:
      return null
  }
}

function getQuestionPromptForState(state: InterviewState, terms: Record<string, string>, techLevel?: TechLevel): string {
  const level = techLevel || 'intermediate'

  // Adaptive question depth based on expertise
  if (level === 'expert') {
    return getExpertQuestionPrompt(state, terms)
  } else if (level === 'beginner') {
    return getBeginnerQuestionPrompt(state, terms)
  }
  return getIntermediateQuestionPrompt(state, terms)
}

function getExpertQuestionPrompt(state: InterviewState, terms: Record<string, string>): string {
  switch (state) {
    case 'q1_capability':
      return 'Question 1: What capability should this skill provide? Ask for the core behavior, scope boundaries, and any specific APIs/tools it should leverage. Be concise — the user knows the domain.'
    case 'q1_followup':
      return 'Follow up on Q1: The capability description needs more precision. Ask about scope boundaries, error handling strategy, or interaction with other tools/skills.'
    case 'q3_format':
      return `Question 2: What output format and structure? Ask about schema/template specifics, structured vs freeform, and any validation constraints on the output.`
    case 'q3_followup':
      return 'Follow up on Q2: The format spec needs more detail. Ask about error output format, partial success handling, or structured metadata.'
    case 'q4_testing':
      return `Question 3: ${terms.testTerm} strategy — ask about train/validation/holdout split preferences, assertion types (semantic vs exact), and any specific dimensions they want evaluated.`
    case 'edge_cases':
      return 'Question 4: Edge cases and failure modes — ask about: malformed inputs, adversarial prompts, resource constraints, concurrent execution, and explicit refusal conditions.'
    case 'q2_trigger':
      return `Question 5 (final): What ${terms.triggerTerm}s should activate this skill? Ask for 2-3 trigger patterns including edge cases and near-miss scenarios that should NOT trigger.`
    case 'q2_followup':
      return 'Follow up on Q5: Need more trigger diversity. Ask for negative examples (should-not-trigger cases) or ambiguous edge cases.'
    default:
      return ''
  }
}

function getBeginnerQuestionPrompt(state: InterviewState, terms: Record<string, string>): string {
  switch (state) {
    case 'q1_capability':
      return 'Question 1: What would you like this skill to help with? Use simple language and give an example to help the user understand. Ask them to describe the task in their own words, like explaining it to a friend.'
    case 'q1_followup':
      return "Follow up on Q1: The user's description is a bit general. Give a concrete example of what you think they mean and ask if that's right, or ask them to walk through a specific scenario step by step."
    case 'q3_format':
      return 'Question 2: What should the result look like? Explain the options in plain terms: "Should it produce a document, some code, a list, or something else?" Give examples of each.'
    case 'q3_followup':
      return 'Follow up on Q2: Help narrow it down — ask "Should it be more like a paragraph of text, a step-by-step list, or structured data like a table?"'
    case 'q4_testing':
      return `Question 3: Want to add ${terms.testTerm} to make sure the skill works correctly? Explain in simple terms: "Testing means we check the skill with sample inputs to make sure it gives good results." Recommend saying yes and explain it helps catch problems early.`
    case 'edge_cases':
      return 'Question 4: Are there any tricky situations this skill should handle? Help the user think about this by asking: "What if someone gives it weird input? What if the request is unclear? Should the skill ever say no?" Give a concrete example relevant to their skill.'
    case 'q2_trigger':
      return `Question 5 (final): When should this skill turn on? Explain that ${terms.triggerTerm} means "what would someone type to use this skill?" Give 1-2 examples first, then ask the user to share their own examples.`
    case 'q2_followup':
      return 'Follow up on Q5: The user only gave one example. Help them think of more by suggesting variations — different wordings, different scenarios — and ask which ones feel right.'
    default:
      return ''
  }
}

function getIntermediateQuestionPrompt(state: InterviewState, terms: Record<string, string>): string {
  switch (state) {
    case 'q1_capability':
      return 'Question 1: What should this skill enable Claude to do? Ask the user to describe what they want.'
    case 'q1_followup':
      return 'Follow up on Q1: The user\'s capability answer was vague. Ask ONE clarifying question about scope or specifics.'
    case 'q3_format':
      return 'Question 2: What output format does the user expect? (markdown, code, JSON, etc.)'
    case 'q3_followup':
      return 'Follow up on Q2: The format answer was vague. Ask if they want structured or freeform output.'
    case 'q4_testing':
      return `Question 3: Should we set up ${terms.testTerm}? Suggest appropriate defaults based on the skill type. Explain WHY testing matters for this skill.`
    case 'edge_cases':
      return 'Question 4: What edge cases or tricky scenarios should this skill handle? Ask about: unusual inputs, error conditions, boundary cases, and when the skill should explicitly refuse to act.'
    case 'q2_trigger':
      return `Question 5 (final): When should this skill trigger? Ask for 2-3 examples of what a user might say (${terms.triggerTerm}).`
    case 'q2_followup':
      return 'Follow up on Q5: The user gave only 1 trigger example. Ask for 1-2 more varied phrasings.'
    default:
      return ''
  }
}

function getDefaultNextState(current: InterviewState, needsFollowUp: boolean, followUpCount: number): InterviewState {
  // Never do more than 1 follow-up per question
  const maxedFollowUps = followUpCount >= 4

  // New order: capability → format → testing → edge_cases → trigger → confirm
  switch (current) {
    case 'greeting':
    case 'q1_capability':
      return (needsFollowUp && !maxedFollowUps) ? 'q1_followup' : 'q3_format'
    case 'q1_followup':
      return 'q3_format'
    case 'q3_format':
      return (needsFollowUp && !maxedFollowUps) ? 'q3_followup' : 'q4_testing'
    case 'q3_followup':
      return 'q4_testing'
    case 'q4_testing':
      return 'edge_cases'
    case 'edge_cases':
      return 'q2_trigger'
    case 'q2_trigger':
      return (needsFollowUp && !maxedFollowUps) ? 'q2_followup' : 'confirm'
    case 'q2_followup':
      return 'confirm'
    case 'confirm':
      return 'done'
    default:
      return 'done'
  }
}

function isValidState(state: string): boolean {
  const valid: InterviewState[] = [
    'greeting', 'q1_capability', 'q1_followup',
    'q2_trigger', 'q2_followup',
    'q3_format', 'q3_followup',
    'q4_testing', 'edge_cases', 'confirm', 'done',
  ]
  return valid.includes(state as InterviewState)
}

function generateFallbackResponse(nextState: InterviewState, terms: Record<string, string>, techLevel?: TechLevel): string {
  const level = techLevel || 'intermediate'

  if (level === 'expert') {
    return generateExpertFallbackResponse(nextState, terms)
  } else if (level === 'beginner') {
    return generateBeginnerFallbackResponse(nextState, terms)
  }

  switch (nextState) {
    case 'q1_capability':
      return 'Let\'s create a skill! First, what should this skill enable Claude to do? Describe the core capability you\'re looking for.'
    case 'q3_format':
      return 'Got it! What output format do you expect? For example: markdown documentation, code files, JSON data, plain text, etc.'
    case 'q4_testing':
      return `Should we set up ${terms.testTerm} for this skill? I\'d recommend it — testing helps catch edge cases early. I can generate some automatically based on your answers. Want me to include them?`
    case 'edge_cases':
      return 'Are there any tricky scenarios or edge cases this skill should handle? For example: unusual inputs, error conditions, or situations where it should refuse to act. This helps make the skill more robust.'
    case 'q2_trigger':
      return `Last question! When should this skill activate? Give me 2-3 examples of what a user might say that should trigger this ${terms.skillTerm}.`
    case 'confirm':
      return 'I\'ve captured all the key details. Please review the answers below — you can click any card to edit it. When everything looks good, click "Generate Skill" to proceed.'
    default:
      return 'Thanks for the details!'
  }
}

function generateExpertFallbackResponse(nextState: InterviewState, terms: Record<string, string>): string {
  switch (nextState) {
    case 'q1_capability':
      return 'What capability should this skill provide? Include scope boundaries and key behaviors.'
    case 'q3_format':
      return 'Output format? Specify structure (schema/template), any validation constraints, and error output format.'
    case 'q4_testing':
      return `${terms.testTerm} config — I\'ll generate train/validation/holdout splits with semantic assertions. Want custom assertion dimensions or specific eval criteria?`
    case 'edge_cases':
      return 'Edge cases: malformed inputs, adversarial prompts, resource constraints, concurrent execution, explicit refusal conditions?'
    case 'q2_trigger':
      return `Final question: ${terms.triggerTerm} patterns — give me 2-3 trigger examples plus any near-miss cases that should NOT trigger.`
    case 'confirm':
      return 'Review the extracted answers below. Edit any card, then hit Generate.'
    default:
      return 'Noted.'
  }
}

function generateBeginnerFallbackResponse(nextState: InterviewState, terms: Record<string, string>): string {
  switch (nextState) {
    case 'q1_capability':
      return 'Let\'s build a skill together! First, describe what you\'d like this skill to help with — imagine you\'re explaining the task to a friend. What problem does it solve?'
    case 'q3_format':
      return 'What should the result look like? Should it be a paragraph of text, a step-by-step list, some code, a table, or something else? No wrong answers here!'
    case 'q4_testing':
      return `Great job so far! I\'d recommend we add some ${terms.testTerm} — these are sample inputs I\'ll check the skill against to make sure it works correctly. Think of it like a practice quiz. Want me to set those up for you?`
    case 'edge_cases':
      return 'Can you think of any tricky situations? For example: What if someone asks for something slightly different? What if the input is really short or really long? Should the skill ever say "I can\'t help with that"?'
    case 'q2_trigger':
      return `Last one! What would someone type to use this skill? Think of it like a command or request — for example, "Help me write a haiku" or "Review this code". Give me 2-3 examples of what someone might say.`
    case 'confirm':
      return 'I\'ve captured everything you said! Take a look at the answer cards below — you can click any one to edit it if something doesn\'t look right. When you\'re happy with everything, click "Generate Skill" to create your skill!'
    default:
      return 'Thanks for sharing that!'
  }
}

// ─── Intent Confidence Scoring ──────────────────────────────────────────────

/**
 * Compute a confidence score for how well the wizard understood the user's intent.
 * Runs deterministically from the extracted answers — no LLM call needed.
 */
export function computeIntentConfidence(context: InterviewContext): IntentConfidenceScore {
  const answers = context.extractedAnswers
  const coreKeys: ExtractedAnswer['questionKey'][] = ['capability', 'trigger', 'format']
  const allKeys: ExtractedAnswer['questionKey'][] = ['capability', 'trigger', 'format', 'testing', 'edge_cases']

  // 1. Completeness: what fraction of questions have answers?
  const answeredKeys = new Set(answers.map(a => a.questionKey))
  const coreAnswered = coreKeys.filter(k => answeredKeys.has(k)).length
  const allAnswered = allKeys.filter(k => answeredKeys.has(k)).length
  // Core questions (capability, trigger, format) are weighted 2x
  const completeness = Math.round(((coreAnswered * 2 + (allAnswered - coreAnswered)) / (coreKeys.length * 2 + (allKeys.length - coreKeys.length))) * 100)

  // 2. Clarity: based on confidence levels of extracted answers
  const confidenceValues: Record<string, number> = { high: 100, medium: 60, low: 25 }
  const clarityScores = answers.map(a => confidenceValues[a.confidence] || 50)
  const clarity = clarityScores.length > 0
    ? Math.round(clarityScores.reduce((a, b) => a + b, 0) / clarityScores.length)
    : 0

  // 3. Specificity: how long/detailed are the answers?
  const specificityScores = answers.map(a => {
    const len = a.answer.length
    if (len > 200) return 100
    if (len > 100) return 80
    if (len > 50) return 60
    if (len > 20) return 40
    return 20
  })
  const specificity = specificityScores.length > 0
    ? Math.round(specificityScores.reduce((a, b) => a + b, 0) / specificityScores.length)
    : 0

  // 4. Consistency: check that trigger answers reference the capability
  let consistency = 70 // Base score
  const capAnswer = answers.find(a => a.questionKey === 'capability')
  const trigAnswer = answers.find(a => a.questionKey === 'trigger')
  if (capAnswer && trigAnswer) {
    // Extract key words from capability and check if triggers are related
    const capWords = capAnswer.answer.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const trigText = trigAnswer.answer.toLowerCase()
    const overlap = capWords.filter(w => trigText.includes(w)).length
    if (overlap >= 2) {
      consistency = 95
    } else if (overlap >= 1) {
      consistency = 80
    } else {
      consistency = 55
    }
  }
  // Penalize if answers marked as needing follow-up weren't resolved
  const unresolvedFollowUps = answers.filter(a => a.needsFollowUp).length
  consistency = Math.max(20, consistency - unresolvedFollowUps * 15)

  // Overall: weighted average
  const overall = Math.round(
    completeness * 0.30 +
    clarity * 0.30 +
    specificity * 0.20 +
    consistency * 0.20
  )

  // Summary
  let summary: string
  if (overall >= 80) {
    summary = 'Strong understanding — the wizard has a clear picture of your intent and can generate a high-quality skill.'
  } else if (overall >= 60) {
    summary = 'Good understanding — the wizard captured the main ideas but some details could be refined. Consider editing low-confidence answers.'
  } else if (overall >= 40) {
    summary = 'Partial understanding — the wizard has a rough idea but may need more detail on key questions. Edit the answer cards to improve accuracy.'
  } else {
    summary = 'Limited understanding — several key questions are unanswered or vague. Please review and edit the answer cards before generating.'
  }

  return {
    overall,
    dimensions: { clarity, completeness, specificity, consistency },
    summary,
  }
}

/**
 * Generate the opening greeting message for the interview.
 */
export function generateGreeting(mode: string): string {
  const modeIntros: Record<string, string> = {
    scratch: "Let's create a new skill from scratch! I'll ask you 5 quick questions to understand what you need.",
    extract: "Let's extract a skill from your experience! I'll ask 5 questions to capture the key patterns.",
    synthesize: "Let's build a skill from your artifacts! I'll ask 5 questions to understand how to structure it.",
    hybrid: "Let's create a skill combining your experience and documentation! 5 quick questions to get started.",
  }

  const intro = modeIntros[mode] || modeIntros.scratch
  return `${intro}\n\n**Question 1:** What should this skill enable Claude to do? Describe the core capability in your own words.`
}

/**
 * Convert extracted interview answers into WizardInput-compatible format.
 */
export function interviewAnswersToWizardInput(context: InterviewContext): {
  intent: string
  concreteExamples: string[]
  desiredOutputFormat: string
  interviewTranscript: string
} {
  const capabilityAnswer = context.extractedAnswers.find(a => a.questionKey === 'capability')
  const triggerAnswer = context.extractedAnswers.find(a => a.questionKey === 'trigger')
  const formatAnswer = context.extractedAnswers.find(a => a.questionKey === 'format')
  const edgeCasesAnswer = context.extractedAnswers.find(a => a.questionKey === 'edge_cases')

  // Build a rich intent from all answers
  const intentParts: string[] = []
  if (capabilityAnswer) intentParts.push(capabilityAnswer.answer)
  if (triggerAnswer) intentParts.push(`Trigger conditions: ${triggerAnswer.answer}`)
  if (formatAnswer) intentParts.push(`Output format: ${formatAnswer.answer}`)
  if (edgeCasesAnswer) intentParts.push(`Edge cases to handle: ${edgeCasesAnswer.answer}`)

  // Extract trigger examples as concrete examples
  const triggerText = triggerAnswer?.answer || ''
  const concreteExamples = triggerText
    .split(/[,;\n]/)
    .map(s => s.replace(/^[-•\d.)\s]+/, '').trim())
    .filter(s => s.length > 5)

  // Build transcript
  const transcript = context.messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  return {
    intent: intentParts.join('\n\n'),
    concreteExamples,
    desiredOutputFormat: formatAnswer?.answer || '',
    interviewTranscript: transcript,
  }
}
