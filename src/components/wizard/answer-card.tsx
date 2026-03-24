'use client'

import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Edit3, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { ExtractedAnswer } from '@/lib/services/wizard/interview-service'

interface AnswerCardProps {
  answer: ExtractedAnswer
  questionLabel: string
  questionNumber: number
  onEdit: (updated: ExtractedAnswer) => void
  isActive: boolean
}

const CONFIDENCE_CONFIG = {
  high: {
    icon: CheckCircle2,
    label: 'High confidence',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    dot: 'bg-green-400',
  },
  medium: {
    icon: AlertCircle,
    label: 'Medium confidence',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    dot: 'bg-amber-400',
  },
  low: {
    icon: AlertCircle,
    label: 'Low confidence — consider editing',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    dot: 'bg-red-400',
  },
}

export function AnswerCard({ answer, questionLabel, questionNumber, onEdit, isActive }: AnswerCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(answer.answer)
  const [isExpanded, setIsExpanded] = useState(isActive)

  const conf = CONFIDENCE_CONFIG[answer.confidence]
  const ConfIcon = conf.icon

  function handleSave() {
    onEdit({
      ...answer,
      answer: editValue,
      confidence: 'high', // User-edited answers are always high confidence
      needsFollowUp: false,
    })
    setIsEditing(false)
  }

  function handleCancel() {
    setEditValue(answer.answer)
    setIsEditing(false)
  }

  return (
    <div className={`border rounded-lg transition-all ${isActive ? `${conf.border} ${conf.bg}` : 'border-border bg-card'}`}>
      {/* Header — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
            isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
          }`}>
            {questionNumber}
          </div>
          <span className="text-sm font-medium">{questionLabel}</span>
          <div className={`flex items-center gap-1.5 ${conf.color}`}>
            <div className={`h-1.5 w-1.5 rounded-full ${conf.dot}`} />
            <span className="text-xs">{conf.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); setIsExpanded(true) }}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
              title="Edit answer"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          )}
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Body — collapsible */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90"
                >
                  <Check className="h-3 w-3" /> Save
                </button>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 border border-border rounded text-xs hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground whitespace-pre-wrap pl-9">
              {answer.answer}
              {answer.followUpReason && (
                <p className="mt-2 text-xs italic">
                  <ConfIcon className="h-3 w-3 inline mr-1" />
                  {answer.followUpReason}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
