'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Trophy, Scale, TrendingUp, TrendingDown,
  Minus, Loader2, Play, AlertCircle
} from 'lucide-react'
import { useTechLevel, toTitleCase } from '@/lib/context/tech-level-context'
import { TooltipTerm } from '@/components/ui/tooltip-term'

interface ComparisonSummary {
  totalComparisons: number
  skillWins: number
  baselineWins: number
  ties: number
  avgDelta: number
  avgSkillScore: number
  avgBaselineScore: number
  skillWinRate: number
}

interface RubricScores {
  content: Record<string, number>
  structure: Record<string, number>
  content_score: number
  structure_score: number
  overall_score: number
}

interface OutputQuality {
  score: number
  strengths: string[]
  weaknesses: string[]
}

interface BlindComparisonItem {
  id: string
  evalCaseRunId: string
  evalRunId: string
  winner: string
  skillIsA: boolean
  delta: number
  reasoningText: string
  rubricJson: string
  outputQualityJson: string
  expectationResultsJson: string
  skillScore: number
  baselineScore: number
  createdAt: string
  evalCaseRun: {
    evalCase: {
      id: string
      name: string
      prompt: string
    }
  }
}

interface ComparisonData {
  comparisons: BlindComparisonItem[]
  summary: ComparisonSummary
}

export default function ComparisonPage() {
  const params = useParams()
  const runId = params.id as string
  const { terms } = useTechLevel()

  const [data, setData] = useState<ComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedCase, setExpandedCase] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadComparisons = useCallback(async () => {
    const res = await fetch(`/api/eval-runs/${runId}/compare`)
    if (res.ok) {
      const json = await res.json() as ComparisonData
      setData(json)
    }
    setLoading(false)
  }, [runId])

  useEffect(() => {
    loadComparisons()
  }, [loadComparisons])

  const handleRunComparisons = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/eval-runs/${runId}/compare`, { method: 'POST' })
      if (res.ok) {
        await loadComparisons()
      } else {
        const err = await res.json() as { error?: string }
        setError(err.error || 'Failed to run comparisons')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run comparisons')
    } finally {
      setRunning(false)
    }
  }

  const winnerIcon = (winner: string) => {
    switch (winner) {
      case 'skill': return <Trophy className="h-4 w-4 text-green-400" />
      case 'baseline': return <TrendingDown className="h-4 w-4 text-red-400" />
      case 'TIE': return <Minus className="h-4 w-4 text-yellow-400" />
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />
    }
  }

  const deltaColor = (delta: number) => {
    if (delta > 0) return 'text-green-400'
    if (delta < 0) return 'text-red-400'
    return 'text-yellow-400'
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading comparisons...</div>
  }

  const hasComparisons = data && data.comparisons.length > 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href={`/evals/runs/${runId}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ChevronLeft className="h-4 w-4" /> Back to Eval Run
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold"><TooltipTerm term="blind comparison">Blind Comparison</TooltipTerm></h1>
            <span className="text-sm text-muted-foreground font-mono">{runId.slice(0, 8)}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasComparisons && (
              <button
                onClick={async () => {
                  setDeleting(true)
                  setError(null)
                  await fetch(`/api/eval-runs/${runId}/compare`, { method: 'DELETE' })
                  setDeleting(false)
                  await loadComparisons()
                }}
                disabled={deleting || running}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-md text-sm hover:bg-accent disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Clear & Re-run'}
              </button>
            )}
            {!hasComparisons && (
              <button
                onClick={handleRunComparisons}
                disabled={running}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running comparisons...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Blind Comparisons
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Each eval case is re-executed without the skill (baseline), then a blind comparator
          judges which output is better without knowing which used the skill.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4 text-red-400 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Summary Cards */}
      {hasComparisons && data.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border border-border rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{data.summary.skillWinRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">Skill Win Rate</p>
          </div>
          <div className="border border-border rounded-lg p-4 text-center">
            <p className={`text-3xl font-bold ${deltaColor(data.summary.avgDelta)}`}>
              {data.summary.avgDelta > 0 ? '+' : ''}{data.summary.avgDelta}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Avg {toTitleCase(terms.delta)}</p>
          </div>
          <div className="border border-border rounded-lg p-4 text-center">
            <p className="text-3xl font-bold">{data.summary.avgSkillScore}</p>
            <p className="text-xs text-muted-foreground mt-1">Avg Skill Score</p>
          </div>
          <div className="border border-border rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-muted-foreground">{data.summary.avgBaselineScore}</p>
            <p className="text-xs text-muted-foreground mt-1">Avg {toTitleCase(terms.baseline)} Score</p>
          </div>
        </div>
      )}

      {/* Win/Loss/Tie breakdown */}
      {hasComparisons && data.summary && (
        <div className="border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">Results Breakdown</h3>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-green-400" />
              <span className="text-sm">Skill wins: <strong>{data.summary.skillWins}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <span className="text-sm">Baseline wins: <strong>{data.summary.baselineWins}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Minus className="h-4 w-4 text-yellow-400" />
              <span className="text-sm">Ties: <strong>{data.summary.ties}</strong></span>
            </div>
            <div className="text-sm text-muted-foreground">
              Total: {data.summary.totalComparisons} comparisons
            </div>
          </div>

          {/* Score bar visualization */}
          {data.summary.totalComparisons > 0 && (
            <div className="mt-4">
              <div className="flex h-6 rounded-md overflow-hidden">
                {data.summary.skillWins > 0 && (
                  <div
                    className="bg-green-500/30 flex items-center justify-center text-xs text-green-400"
                    style={{ width: `${(data.summary.skillWins / data.summary.totalComparisons) * 100}%` }}
                  >
                    {data.summary.skillWins}
                  </div>
                )}
                {data.summary.ties > 0 && (
                  <div
                    className="bg-yellow-500/20 flex items-center justify-center text-xs text-yellow-400"
                    style={{ width: `${(data.summary.ties / data.summary.totalComparisons) * 100}%` }}
                  >
                    {data.summary.ties}
                  </div>
                )}
                {data.summary.baselineWins > 0 && (
                  <div
                    className="bg-red-500/20 flex items-center justify-center text-xs text-red-400"
                    style={{ width: `${(data.summary.baselineWins / data.summary.totalComparisons) * 100}%` }}
                  >
                    {data.summary.baselineWins}
                  </div>
                )}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Skill Better</span>
                <span>Baseline Better</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Individual Comparisons */}
      {hasComparisons && (
        <div className="space-y-3">
          <h3 className="font-medium">Per-Case Comparisons</h3>
          {data.comparisons.map(comp => {
            const isExpanded = expandedCase === comp.id
            const rubric = (() => { try { return JSON.parse(comp.rubricJson) as { A: RubricScores; B: RubricScores } } catch { return null } })()
            const quality = (() => { try { return JSON.parse(comp.outputQualityJson) as { A: OutputQuality; B: OutputQuality } } catch { return null } })()

            // Unblind: map A/B to skill/baseline
            const skillRubric = rubric ? (comp.skillIsA ? rubric.A : rubric.B) : null
            const baselineRubric = rubric ? (comp.skillIsA ? rubric.B : rubric.A) : null
            const skillQuality = quality ? (comp.skillIsA ? quality.A : quality.B) : null
            const baselineQuality = quality ? (comp.skillIsA ? quality.B : quality.A) : null

            return (
              <div key={comp.id} className="border border-border rounded-lg">
                <button
                  onClick={() => setExpandedCase(isExpanded ? null : comp.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {winnerIcon(comp.winner)}
                    <span className="font-medium">{comp.evalCaseRun.evalCase.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      comp.winner === 'skill' ? 'bg-green-500/10 text-green-400' :
                      comp.winner === 'baseline' ? 'bg-red-500/10 text-red-400' :
                      'bg-yellow-500/10 text-yellow-400'
                    }`}>
                      {comp.winner === 'skill' ? 'Skill Wins' : comp.winner === 'baseline' ? 'Baseline Wins' : 'Tie'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-green-400">{comp.skillScore.toFixed(1)}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span className="text-muted-foreground">{comp.baselineScore.toFixed(1)}</span>
                    <span className={`font-mono ${deltaColor(comp.delta)}`}>
                      {comp.delta > 0 ? '+' : ''}{comp.delta.toFixed(1)}
                    </span>
                    <TrendingUp className={`h-4 w-4 ${isExpanded ? 'rotate-180' : ''} transition-transform text-muted-foreground`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    {/* Reasoning */}
                    <div>
                      <h4 className="text-sm font-medium mb-1">Reasoning</h4>
                      <p className="text-sm text-muted-foreground">{comp.reasoningText}</p>
                    </div>

                    {/* Rubric Scores Side-by-Side */}
                    {skillRubric && baselineRubric && (
                      <div>
                        <h4 className="text-sm font-medium mb-2"><TooltipTerm term="rubric score">Rubric Scores</TooltipTerm></h4>
                        <div className="grid grid-cols-2 gap-4">
                          {/* Skill rubric */}
                          <div className="border border-green-500/20 rounded-lg p-3">
                            <h5 className="text-xs text-green-400 font-medium mb-2">With Skill ({comp.skillScore.toFixed(1)}/10)</h5>
                            <div className="space-y-1 text-sm">
                              <p className="text-muted-foreground">Content: {skillRubric.content_score?.toFixed(1)}/5</p>
                              {Object.entries(skillRubric.content || {}).map(([key, val]) => (
                                <p key={key} className="text-xs text-muted-foreground pl-3">{key}: {val}/5</p>
                              ))}
                              <p className="text-muted-foreground">Structure: {skillRubric.structure_score?.toFixed(1)}/5</p>
                              {Object.entries(skillRubric.structure || {}).map(([key, val]) => (
                                <p key={key} className="text-xs text-muted-foreground pl-3">{key}: {val}/5</p>
                              ))}
                            </div>
                          </div>

                          {/* Baseline rubric */}
                          <div className="border border-border rounded-lg p-3">
                            <h5 className="text-xs text-muted-foreground font-medium mb-2">Without Skill ({comp.baselineScore.toFixed(1)}/10)</h5>
                            <div className="space-y-1 text-sm">
                              <p className="text-muted-foreground">Content: {baselineRubric.content_score?.toFixed(1)}/5</p>
                              {Object.entries(baselineRubric.content || {}).map(([key, val]) => (
                                <p key={key} className="text-xs text-muted-foreground pl-3">{key}: {val}/5</p>
                              ))}
                              <p className="text-muted-foreground">Structure: {baselineRubric.structure_score?.toFixed(1)}/5</p>
                              {Object.entries(baselineRubric.structure || {}).map(([key, val]) => (
                                <p key={key} className="text-xs text-muted-foreground pl-3">{key}: {val}/5</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Strengths & Weaknesses */}
                    {skillQuality && baselineQuality && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Quality Assessment</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <h5 className="text-xs text-green-400 font-medium">With Skill</h5>
                            {skillQuality.strengths.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground">Strengths:</p>
                                <ul className="text-xs text-muted-foreground list-disc pl-4">
                                  {skillQuality.strengths.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                              </div>
                            )}
                            {skillQuality.weaknesses.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground">Weaknesses:</p>
                                <ul className="text-xs text-red-400/60 list-disc pl-4">
                                  {skillQuality.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <h5 className="text-xs text-muted-foreground font-medium">Without Skill</h5>
                            {baselineQuality.strengths.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground">Strengths:</p>
                                <ul className="text-xs text-muted-foreground list-disc pl-4">
                                  {baselineQuality.strengths.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                              </div>
                            )}
                            {baselineQuality.weaknesses.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground">Weaknesses:</p>
                                <ul className="text-xs text-red-400/60 list-disc pl-4">
                                  {baselineQuality.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Prompt */}
                    <div>
                      <h4 className="text-sm font-medium mb-1">Eval Prompt</h4>
                      <p className="text-xs text-muted-foreground bg-accent/30 rounded p-2 font-mono whitespace-pre-wrap">
                        {comp.evalCaseRun.evalCase.prompt.slice(0, 500)}
                        {comp.evalCaseRun.evalCase.prompt.length > 500 ? '...' : ''}
                      </p>
                    </div>

                    {/* Blind assignment info */}
                    <p className="text-xs text-muted-foreground">
                      Blind assignment: Skill was labeled {comp.skillIsA ? 'A' : 'B'} (random)
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!hasComparisons && !running && (
        <div className="text-center py-12 text-muted-foreground">
          <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Comparisons Yet</h3>
          <p className="text-sm mb-4">
            Run blind comparisons to see how the skill output compares against bare Claude (no skill).
          </p>
          <button
            onClick={handleRunComparisons}
            disabled={running}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <Play className="h-4 w-4 inline mr-2" />
            Run Blind Comparisons
          </button>
        </div>
      )}
    </div>
  )
}
