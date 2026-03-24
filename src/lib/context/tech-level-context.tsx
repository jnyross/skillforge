'use client'

/**
 * Tech Level Context — Provides adaptive language throughout the app.
 * Reads/writes tech level to localStorage for persistence.
 * Auto-detects from interview if available.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { TechLevel } from '@/lib/services/wizard/interview-service'

interface AdaptiveTerms {
  evalTerm: string
  triggerTerm: string
  assertionTerm: string
  skillTerm: string
  testTerm: string
  passRate: string
  baseline: string
  blindComparison: string
  iteration: string
  triggerDescription: string
  evalSuite: string
  evalCase: string
  skillVersion: string
  analyzer: string
  improver: string
  qualityGate: string
  rubric: string
  delta: string
  trainSplit: string
  testSplit: string
  nonDiscriminating: string
  highVariance: string
  suggestion: string
  falsePositive: string
  falseNegative: string
}

function getAdaptiveTerms(level: TechLevel): AdaptiveTerms {
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
      trainSplit: 'train split',
      testSplit: 'test split',
      nonDiscriminating: 'non-discriminating assertion',
      highVariance: 'high-variance assertion',
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
      trainSplit: 'training set',
      testSplit: 'test set',
      nonDiscriminating: 'always-same-result check',
      highVariance: 'inconsistent check',
      suggestion: 'suggestion',
      falsePositive: 'wrong activation',
      falseNegative: 'missed activation',
    }
  }
  // beginner
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
    trainSplit: 'practice examples',
    testSplit: 'final test examples',
    nonDiscriminating: 'not-useful check',
    highVariance: 'unreliable check',
    suggestion: 'recommendation',
    falsePositive: 'accidental activation',
    falseNegative: 'missed activation',
  }
}

interface TechLevelContextValue {
  level: TechLevel
  terms: AdaptiveTerms
  setLevel: (level: TechLevel) => void
}

const TechLevelContext = createContext<TechLevelContextValue>({
  level: 'intermediate',
  terms: getAdaptiveTerms('intermediate'),
  setLevel: () => {},
})

const STORAGE_KEY = 'skillforge-tech-level'

export function TechLevelProvider({ children }: { children: React.ReactNode }) {
  const [level, setLevelState] = useState<TechLevel>('intermediate')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'beginner' || stored === 'intermediate' || stored === 'expert') {
      setLevelState(stored)
    }
  }, [])

  const setLevel = useCallback((newLevel: TechLevel) => {
    setLevelState(newLevel)
    localStorage.setItem(STORAGE_KEY, newLevel)
  }, [])

  const terms = getAdaptiveTerms(level)

  return (
    <TechLevelContext.Provider value={{ level, terms, setLevel }}>
      {children}
    </TechLevelContext.Provider>
  )
}

export function useTechLevel(): TechLevelContextValue {
  return useContext(TechLevelContext)
}

export type { AdaptiveTerms }
