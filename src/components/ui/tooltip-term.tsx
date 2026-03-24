'use client'

/**
 * TooltipTerm — Inline tooltip for technical terms.
 * Shows a dotted underline + hover tooltip for beginner/intermediate users.
 * Renders as plain text for expert users.
 */

import React, { useState } from 'react'
import { useTechLevel } from '@/lib/context/tech-level-context'
import { CONCEPT_GLOSSARY } from '@/lib/constants/concept-glossary'

interface TooltipTermProps {
  /** The glossary key to look up, or a custom explanation */
  term: string
  /** Custom explanation — overrides glossary lookup */
  explanation?: string
  children: React.ReactNode
}

export function TooltipTerm({ term, explanation, children }: TooltipTermProps) {
  const { level } = useTechLevel()
  const [show, setShow] = useState(false)

  // Expert users don't need tooltips
  if (level === 'expert') {
    return <>{children}</>
  }

  const tooltipText = explanation || CONCEPT_GLOSSARY[term] || term

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="border-b border-dotted border-muted-foreground/50 cursor-help">
        {children}
      </span>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs bg-popover text-popover-foreground border border-border rounded-md shadow-lg whitespace-normal max-w-xs z-50 pointer-events-none">
          {tooltipText}
        </span>
      )}
    </span>
  )
}
