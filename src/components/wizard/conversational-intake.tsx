'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, User, Bot, ChevronDown } from 'lucide-react'
import { AnswerCard } from './answer-card'
import type {
  InterviewContext,
  ExtractedAnswer,
  InterviewState,
} from '@/lib/services/wizard/interview-service'
import { INTERVIEW_QUESTIONS, getQuestionNumber, getTotalQuestions } from '@/lib/services/wizard/interview-service'

interface ConversationalIntakeProps {
  mode: string
  onComplete: (context: InterviewContext) => void
  initialContext?: InterviewContext | null
}

export function ConversationalIntake({ mode, onComplete, initialContext }: ConversationalIntakeProps) {
  const [context, setContext] = useState<InterviewContext | null>(initialContext || null)
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Advanced fields (collapsible)
  const [corrections, setCorrections] = useState('')
  const [safetyConstraints, setSafetyConstraints] = useState('')
  const [allowedTools, setAllowedTools] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [context?.messages])

  // Start interview on mount
  useEffect(() => {
    if (!context) {
      startInterview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startInterview() {
    try {
      const res = await fetch('/api/wizard/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', mode }),
      })
      const data = await res.json() as { context: InterviewContext; error?: string }
      if (data.error) {
        setError(data.error)
        return
      }
      setContext(data.context)
    } catch {
      setError('Failed to start interview. Please try again.')
    }
  }

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading || !context) return

    const message = inputValue.trim()
    setInputValue('')
    setIsLoading(true)
    setError(null)

    // Optimistically add user message to UI
    const optimisticContext: InterviewContext = {
      ...context,
      messages: [
        ...context.messages,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
      ],
    }
    setContext(optimisticContext)

    try {
      const res = await fetch('/api/wizard/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context, mode }),
      })
      const data = await res.json() as { context: InterviewContext; error?: string }
      if (data.error) {
        setError(data.error)
        // Revert optimistic update
        setContext(context)
        setIsLoading(false)
        return
      }
      setContext(data.context)

      // If interview is complete, notify parent
      if (data.context.state === 'confirm' || data.context.state === 'done') {
        // Don't auto-complete — let user review answer cards first
      }
    } catch {
      setError('Failed to send message. Please try again.')
      setContext(context)
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [inputValue, isLoading, context, mode])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleAnswerEdit(updated: ExtractedAnswer) {
    if (!context) return
    const newAnswers = context.extractedAnswers.map(a =>
      a.questionKey === updated.questionKey ? updated : a
    )
    setContext({ ...context, extractedAnswers: newAnswers })
  }

  function handleGenerate() {
    if (!context) return
    // Attach advanced options to context before completing
    const finalContext: InterviewContext = {
      ...context,
      // Store advanced options in a message so they're preserved in transcript
      messages: showAdvanced && (corrections || safetyConstraints || allowedTools)
        ? [
            ...context.messages,
            {
              role: 'user' as const,
              content: `[Advanced options] ${corrections ? `Corrections: ${corrections}. ` : ''}${safetyConstraints ? `Safety constraints: ${safetyConstraints}. ` : ''}${allowedTools ? `Allowed tools: ${allowedTools}.` : ''}`,
              timestamp: new Date().toISOString(),
            },
          ]
        : context.messages,
    }
    onComplete(finalContext)
  }

  const isConfirming = context?.state === 'confirm' || context?.state === 'done'
  const currentQ = context ? getQuestionNumber(context.state) : 1
  const totalQ = getTotalQuestions()
  const techLevel = context?.techLevel

  return (
    <div className="space-y-4">
      {/* Progress breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Array.from({ length: totalQ }, (_, i) => {
            const qNum = i + 1
            const isCompleted = context?.extractedAnswers.some(
              a => a.questionKey === INTERVIEW_QUESTIONS[i].key
            )
            const isCurrent = qNum === currentQ && !isConfirming
            return (
              <div key={i} className="flex items-center gap-1.5">
                {i > 0 && <div className={`h-px w-6 ${isCompleted ? 'bg-primary' : 'bg-border'}`} />}
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'bg-primary/20 text-primary border border-primary'
                      : 'bg-secondary text-muted-foreground'
                }`}>
                  {qNum}
                </div>
                <span className={`text-xs hidden sm:inline ${isCurrent ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  {INTERVIEW_QUESTIONS[i].shortLabel}
                </span>
              </div>
            )
          })}
        </div>
        {techLevel && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            techLevel.level === 'expert'
              ? 'bg-purple-500/10 text-purple-400'
              : techLevel.level === 'intermediate'
                ? 'bg-blue-500/10 text-blue-400'
                : 'bg-green-500/10 text-green-400'
          }`}>
            {techLevel.level} mode
          </span>
        )}
      </div>

      {/* Chat messages */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto p-4 space-y-4">
          {context?.messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary'
              }`}>
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-secondary rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area — hidden when confirming */}
        {!isConfirming && (
          <div className="border-t border-border p-3">
            {error && (
              <p className="text-xs text-red-400 mb-2">{error}</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer..."
                rows={1}
                className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading}
                className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Question {currentQ} of {totalQ} — Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        )}
      </div>

      {/* Answer cards — shown when we have extracted answers */}
      {context && context.extractedAnswers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            {isConfirming ? 'Review your answers — click any card to edit' : 'Captured so far'}
          </h3>
          {context.extractedAnswers.map((answer, i) => {
            const question = INTERVIEW_QUESTIONS.find(q => q.key === answer.questionKey)
            if (!question) return null
            return (
              <AnswerCard
                key={answer.questionKey}
                answer={answer}
                questionLabel={question.label}
                questionNumber={INTERVIEW_QUESTIONS.indexOf(question) + 1}
                onEdit={handleAnswerEdit}
                isActive={isConfirming}
              />
            )
          })}
        </div>
      )}

      {/* Advanced options — collapsible */}
      {isConfirming && (
        <div className="space-y-4">
          <details
            open={showAdvanced}
            onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
            className="border border-border rounded-lg"
          >
            <summary className="px-4 py-3 text-sm font-medium cursor-pointer hover:bg-accent/50 rounded-lg flex items-center gap-2">
              <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Advanced Options
            </summary>
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Corrections / Gotchas (one per line)
                </label>
                <textarea
                  value={corrections}
                  onChange={e => setCorrections(e.target.value)}
                  placeholder="Things that commonly go wrong or need special handling..."
                  rows={3}
                  className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm resize-y"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Safety Constraints
                </label>
                <textarea
                  value={safetyConstraints}
                  onChange={e => setSafetyConstraints(e.target.value)}
                  placeholder="Any restrictions on what the skill should NOT do..."
                  rows={2}
                  className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm resize-y"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Allowed Tools (comma-separated)
                </label>
                <input
                  value={allowedTools}
                  onChange={e => setAllowedTools(e.target.value)}
                  placeholder="e.g., Read, Write, Bash, Browser"
                  className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm"
                />
              </div>
            </div>
          </details>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
          >
            Generate Skill
          </button>
        </div>
      )}
    </div>
  )
}
