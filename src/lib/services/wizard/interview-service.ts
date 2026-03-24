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

export interface InterviewContext {
  state: InterviewState
  messages: InterviewMessage[]
  extractedAnswers: ExtractedAnswer[]
  techLevel: TechLevelProfile | null
  mode: string
  followUpCount: number // Track follow-ups to avoid infinite loops
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
    key: 'trigger',
    label: 'When should this skill trigger? What would a user say?',
    shortLabel: 'Trigger',
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
      model: 'claude-sonnet-4-20250514',
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
  }
}

export function getQuestionNumber(state: InterviewState): number {
  switch (state) {
    case 'greeting':
    case 'q1_capability':
    case 'q1_followup':
      return 1
    case 'q2_trigger':
    case 'q2_followup':
      return 2
    case 'q3_format':
    case 'q3_followup':
      return 3
    case 'q4_testing':
      return 4
    case 'edge_cases':
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

  // Detect tech level from user's first message
  let updatedContext = { ...context }
  const userMessages = [...context.messages.filter(m => m.role === 'user').map(m => m.content), userMessage]

  if (!updatedContext.techLevel) {
    updatedContext.techLevel = detectTechLevel(userMessages)
  } else if (userMessages.length <= 3) {
    // Refine tech level with more data from early messages
    updatedContext.techLevel = detectTechLevel(userMessages)
  }

  // Add user message to history
  updatedContext.messages = [
    ...updatedContext.messages,
    { role: 'user' as const, content: userMessage, timestamp: new Date().toISOString() },
  ]

  const terms = getAdaptiveTerms(updatedContext.techLevel.level)

  // Handle state transitions
  if (updatedContext.state === 'greeting') {
    updatedContext.state = 'q1_capability'
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

  const systemPrompt = `You are SkillForge's interview assistant, helping users create Claude Code skills through a structured 4-question interview.

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

VALID NEXT STATES based on current state:
- q1_capability → q1_followup (if answer is vague) OR q2_trigger (if answer is good)
- q1_followup → q2_trigger (always move on after follow-up)
- q2_trigger → q2_followup (if only 1 example given) OR q3_format (if good)
- q2_followup → q3_format (always move on)
- q3_format → q3_followup (if vague) OR q4_testing (if good)
- q3_followup → q4_testing (always move on)
- q4_testing → edge_cases (always)
- edge_cases → confirm (always)

CURRENT QUESTION: ${getQuestionPromptForState(context.state, terms)}

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
      model: 'claude-sonnet-4-20250514',
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

        // Update or add extracted answer
        const existingIdx = context.extractedAnswers.findIndex(a => a.questionKey === currentQuestion)
        if (existingIdx >= 0) {
          context.extractedAnswers[existingIdx] = extractedAnswer
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

      const assistantMessage = parsed.response || generateFallbackResponse(nextState, terms)

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

  const response = generateFallbackResponse(nextState, terms)
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

function getQuestionPromptForState(state: InterviewState, terms: Record<string, string>): string {
  switch (state) {
    case 'q1_capability':
      return 'Question 1: What should this skill enable Claude to do? Ask the user to describe what they want.'
    case 'q1_followup':
      return 'Follow up on Q1: The user\'s capability answer was vague. Ask ONE clarifying question about scope or specifics.'
    case 'q2_trigger':
      return `Question 2: When should this skill trigger? Ask for 2-3 examples of what a user might say (${terms.triggerTerm}).`
    case 'q2_followup':
      return 'Follow up on Q2: The user gave only 1 trigger example. Ask for 1-2 more varied phrasings.'
    case 'q3_format':
      return 'Question 3: What output format does the user expect? (markdown, code, JSON, etc.)'
    case 'q3_followup':
      return 'Follow up on Q3: The format answer was vague. Ask if they want structured or freeform output.'
    case 'q4_testing':
      return `Question 4: Should we set up ${terms.testTerm}? Suggest appropriate defaults based on the skill type. Explain WHY testing matters for this skill.`
    case 'edge_cases':
      return 'Question 5: What edge cases or tricky scenarios should this skill handle? Ask about: unusual inputs, error conditions, boundary cases, and when the skill should explicitly refuse to act.'
    default:
      return ''
  }
}

function getDefaultNextState(current: InterviewState, needsFollowUp: boolean, followUpCount: number): InterviewState {
  // Never do more than 1 follow-up per question
  const maxedFollowUps = followUpCount >= 4

  switch (current) {
    case 'greeting':
    case 'q1_capability':
      return (needsFollowUp && !maxedFollowUps) ? 'q1_followup' : 'q2_trigger'
    case 'q1_followup':
      return 'q2_trigger'
    case 'q2_trigger':
      return (needsFollowUp && !maxedFollowUps) ? 'q2_followup' : 'q3_format'
    case 'q2_followup':
      return 'q3_format'
    case 'q3_format':
      return (needsFollowUp && !maxedFollowUps) ? 'q3_followup' : 'q4_testing'
    case 'q3_followup':
      return 'q4_testing'
    case 'q4_testing':
      return 'edge_cases'
    case 'edge_cases':
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

function generateFallbackResponse(nextState: InterviewState, terms: Record<string, string>): string {
  switch (nextState) {
    case 'q1_capability':
      return 'Let\'s create a skill! First, what should this skill enable Claude to do? Describe the core capability you\'re looking for.'
    case 'q2_trigger':
      return `Got it! Now, when should this skill activate? Give me 2-3 examples of what a user might say that should trigger this ${terms.skillTerm}.`
    case 'q3_format':
      return 'Great examples! What output format do you expect? For example: markdown documentation, code files, JSON data, plain text, etc.'
    case 'q4_testing':
      return `Almost done! Should we set up ${terms.testTerm} for this skill? I\'d recommend it — testing helps catch edge cases early. I can generate some automatically based on your answers. Want me to include them?`
    case 'edge_cases':
      return 'Last question! Are there any tricky scenarios or edge cases this skill should handle? For example: unusual inputs, error conditions, or situations where it should refuse to act. This helps make the skill more robust.'
    case 'confirm':
      return 'I\'ve captured all the key details. Please review the answers below — you can click any card to edit it. When everything looks good, click "Generate Skill" to proceed.'
    default:
      return 'Thanks for the details!'
  }
}

/**
 * Generate the opening greeting message for the interview.
 */
export function generateGreeting(mode: string): string {
  const modeIntros: Record<string, string> = {
    scratch: "Let's create a new skill from scratch! I'll ask you 4 quick questions to understand what you need.",
    extract: "Let's extract a skill from your experience! I'll ask 4 questions to capture the key patterns.",
    synthesize: "Let's build a skill from your artifacts! I'll ask 4 questions to understand how to structure it.",
    hybrid: "Let's create a skill combining your experience and documentation! 4 quick questions to get started.",
  }

  return modeIntros[mode] || modeIntros.scratch
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
