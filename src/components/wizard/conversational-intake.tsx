'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, User, Bot, ChevronDown, Gauge, Brain, GraduationCap, Sparkles, Upload, FileText, X } from 'lucide-react'
import { AnswerCard } from './answer-card'
import type {
  InterviewContext,
  ExtractedAnswer,
  IntentConfidenceScore,
} from '@/lib/services/wizard/interview-service'
import { INTERVIEW_QUESTIONS, getQuestionNumber, getTotalQuestions, computeIntentConfidence } from '@/lib/services/wizard/interview-service'

interface ConversationalIntakeProps {
  mode: string
  onComplete: (context: InterviewContext, advancedOptions?: { corrections: string; safetyConstraints: string; allowedTools: string }) => void
  initialContext?: InterviewContext | null
}

export function ConversationalIntake({ mode, onComplete, initialContext }: ConversationalIntakeProps) {
  const [context, setContext] = useState<InterviewContext | null>(initialContext || null)
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [bulkContent, setBulkContent] = useState('')
  const [showBulkUpload, setShowBulkUpload] = useState(false)

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
    const updatedContext = { ...context, extractedAnswers: newAnswers }
    // Recompute intent confidence when answers are edited
    updatedContext.intentConfidence = computeIntentConfidence(updatedContext)
    setContext(updatedContext)
  }

  function handleGenerate() {
    if (!context) return
    // Attach advanced options to context before completing
    const additionalMessages: { role: 'user'; content: string; timestamp: string }[] = []
    if (bulkContent) {
      additionalMessages.push({
        role: 'user' as const,
        content: `[Bulk reference material]\n${bulkContent}`,
        timestamp: new Date().toISOString(),
      })
    }
    if (corrections || safetyConstraints || allowedTools) {
      additionalMessages.push({
        role: 'user' as const,
        content: `[Advanced options] ${corrections ? `Corrections: ${corrections}. ` : ''}${safetyConstraints ? `Safety constraints: ${safetyConstraints}. ` : ''}${allowedTools ? `Allowed tools: ${allowedTools}.` : ''}`,
        timestamp: new Date().toISOString(),
      })
    }
    const finalContext: InterviewContext = {
      ...context,
      messages: additionalMessages.length > 0
        ? [...context.messages, ...additionalMessages]
        : context.messages,
    }
    onComplete(finalContext, {
      corrections,
      safetyConstraints,
      allowedTools,
    })
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
        <div className="h-[500px] overflow-y-auto p-4 space-y-4">
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
                {msg.role === 'assistant' ? <InlineMarkdown content={msg.content} /> : msg.content}
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
                placeholder="Type your answer... (Shift+Enter for new line)"
                rows={4}
                className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
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
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">
                Question {currentQ} of {totalQ} — Press Enter to send, Shift+Enter for new line
              </p>
              <button
                type="button"
                onClick={() => setShowBulkUpload(!showBulkUpload)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Upload className="h-3 w-3" />
                Paste bulk info
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk upload/paste panel */}
      {showBulkUpload && !isConfirming && (
        <div className="border border-border rounded-lg p-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Bulk Information</h4>
            </div>
            <button onClick={() => setShowBulkUpload(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste documentation, runbooks, examples, or any relevant context. This will be included alongside your interview answers to give the wizard more to work with.
          </p>
          <textarea
            value={bulkContent}
            onChange={e => setBulkContent(e.target.value)}
            placeholder="Paste your documentation, examples, API specs, style guides, or any reference material here..."
            rows={8}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
          />
          {bulkContent && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{bulkContent.length.toLocaleString()} characters</span>
              <span>•</span>
              <span>{bulkContent.split('\n').length} lines</span>
            </div>
          )}
        </div>
      )}

      {/* Intent Confidence Score — shown at confirm stage */}
      {isConfirming && context?.intentConfidence && (
        <IntentConfidenceDisplay confidence={context.intentConfidence} />
      )}

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

      {/* Expertise Detection Badge — shown once locked */}
      {context?.expertiseLocked && context.techLevel && (
        <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg bg-card">
          <div className={`p-2 rounded-full ${
            context.techLevel.level === 'expert'
              ? 'bg-purple-500/10'
              : context.techLevel.level === 'intermediate'
                ? 'bg-blue-500/10'
                : 'bg-green-500/10'
          }`}>
            {context.techLevel.level === 'expert'
              ? <GraduationCap className={`h-4 w-4 text-purple-400`} />
              : context.techLevel.level === 'intermediate'
                ? <Brain className={`h-4 w-4 text-blue-400`} />
                : <Sparkles className={`h-4 w-4 text-green-400`} />
            }
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {context.techLevel.level === 'expert'
                ? 'Expert Mode'
                : context.techLevel.level === 'intermediate'
                  ? 'Intermediate Mode'
                  : 'Guided Mode'}
            </p>
            <p className="text-xs text-muted-foreground">
              {context.techLevel.level === 'expert'
                ? 'Using technical terminology and concise questions.'
                : context.techLevel.level === 'intermediate'
                  ? 'Balanced depth with some technical terms.'
                  : 'Friendly guidance with plain-language explanations.'}
              {context.techLevel.signals.length > 0 && (
                <span className="ml-1">Detected from: {context.techLevel.signals.slice(0, 3).join(', ')}</span>
              )}
            </p>
          </div>
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

// ─── Inline Markdown Renderer (lightweight, for chat messages) ──────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function InlineMarkdown({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Heading
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
        if (headingMatch) {
          const level = headingMatch[1].length
          const sizes = ['text-base font-bold', 'text-sm font-bold', 'text-sm font-semibold', 'text-xs font-semibold', 'text-xs font-medium', 'text-xs font-medium']
          return <div key={i} className={sizes[level - 1] || sizes[0]}>{headingMatch[2]}</div>
        }
        // List item
        if (/^[-*]\s/.test(line)) {
          const escaped = escapeHtml(line.slice(2))
          const formatted = escaped
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 bg-background/50 rounded text-xs font-mono">$1</code>')
          return <div key={i} className="pl-3" dangerouslySetInnerHTML={{ __html: `• ${formatted}` }} />
        }
        // Numbered list
        const numMatch = line.match(/^(\d+)\.\s(.+)/)
        if (numMatch) {
          const escaped = escapeHtml(numMatch[2])
          const formatted = escaped
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 bg-background/50 rounded text-xs font-mono">$1</code>')
          return <div key={i} className="pl-3" dangerouslySetInnerHTML={{ __html: `${numMatch[1]}. ${formatted}` }} />
        }
        // Empty line
        if (!line.trim()) return <div key={i} className="h-1" />
        // Regular text with inline formatting
        const escaped = escapeHtml(line)
        const formatted = escaped
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 bg-background/50 rounded text-xs font-mono">$1</code>')
        return <div key={i} dangerouslySetInnerHTML={{ __html: formatted }} />
      })}
    </div>
  )
}

// ─── Intent Confidence Display ──────────────────────────────────────────────

function IntentConfidenceDisplay({ confidence }: { confidence: IntentConfidenceScore }) {
  const overallColor = confidence.overall >= 80
    ? 'text-green-400'
    : confidence.overall >= 60
      ? 'text-amber-400'
      : 'text-red-400'

  const overallBg = confidence.overall >= 80
    ? 'bg-green-500/10 border-green-500/20'
    : confidence.overall >= 60
      ? 'bg-amber-500/10 border-amber-500/20'
      : 'bg-red-500/10 border-red-500/20'

  const dimensionLabels: Record<string, string> = {
    clarity: 'Clarity',
    completeness: 'Completeness',
    specificity: 'Specificity',
    consistency: 'Consistency',
  }

  return (
    <div className={`border rounded-lg p-4 space-y-3 ${overallBg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className={`h-5 w-5 ${overallColor}`} />
          <h3 className="text-sm font-medium">Intent Confidence</h3>
        </div>
        <span className={`text-2xl font-bold ${overallColor}`}>
          {confidence.overall}%
        </span>
      </div>

      {/* Dimension bars */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {(Object.entries(confidence.dimensions) as [string, number][]).map(([key, value]) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-muted-foreground">{dimensionLabels[key] || key}</span>
              <span className="text-xs font-medium">{value}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  value >= 80 ? 'bg-green-400' : value >= 60 ? 'bg-amber-400' : 'bg-red-400'
                }`}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground">{confidence.summary}</p>
    </div>
  )
}
