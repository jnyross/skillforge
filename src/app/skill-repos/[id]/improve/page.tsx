"use client"

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Play, Loader2, CheckCircle, XCircle,
  TrendingUp, ArrowRight, Lightbulb, Check, X,
  BarChart3, GitBranch,
} from 'lucide-react'

// --- Types ---

interface ImprovementSuggestion {
  priority: 'high' | 'medium' | 'low'
  category: string
  suggestion: string
  expected_impact: string
  evidence?: string
}

interface AnalysisResult {
  comparison_summary: {
    winner: string
    comparator_reasoning: string
    skill_score: number
    baseline_score: number
    delta: number
  }
  winner_strengths: string[]
  loser_weaknesses: string[]
  instruction_following: {
    skill: { score: number; issues: string[] }
    baseline: { score: number; issues: string[] }
  }
  improvement_suggestions: ImprovementSuggestion[]
  transcript_insights: {
    skill_execution_pattern: string
    baseline_execution_pattern: string
  }
}

interface Iteration {
  id: string
  sourceVersionId: string
  resultVersionId: string | null
  iterationNumber: number
  status: string
  passRate: number | null
  skillWinRate: number | null
  avgDelta: number | null
  analysisJson: AnalysisResult | Record<string, never>
  suggestionsJson: ImprovementSuggestion[]
  acceptedIndices: number[]
  error: string | null
  createdAt: string
  completedAt: string | null
}

interface EvalSuite {
  id: string
  name: string
  type: string
}

interface SkillVersion {
  id: string
  commitMessage: string
  createdAt: string
  gitCommitSha: string
  parentVersionId: string | null
}

// --- Component ---

export default function ImprovePage() {
  const params = useParams()
  const repoId = params.id as string

  const [versions, setVersions] = useState<SkillVersion[]>([])
  const [suites, setSuites] = useState<EvalSuite[]>([])
  const [iterations, setIterations] = useState<Iteration[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIteration, setSelectedIteration] = useState<Iteration | null>(null)
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(new Set())
  const [pollingId, setPollingId] = useState<ReturnType<typeof setInterval> | null>(null)

  // Load versions and suites
  const loadData = useCallback(async () => {
    try {
      const [versionsRes, suitesRes] = await Promise.all([
        fetch(`/api/skill-repos/${repoId}/versions`),
        fetch(`/api/eval-suites?skillRepoId=${repoId}`),
      ])

      if (versionsRes.ok) {
        const vData = await versionsRes.json()
        const vList = Array.isArray(vData) ? vData : vData.versions || []
        setVersions(vList)
        if (vList.length > 0 && !selectedVersionId) {
          setSelectedVersionId(vList[0].id)
        }
      }

      if (suitesRes.ok) {
        const sData = await suitesRes.json()
        const sList = Array.isArray(sData) ? sData : sData.suites || []
        // Filter to output suites (not trigger suites)
        const outputSuites = sList.filter((s: EvalSuite) => s.type === 'output' || s.type === 'workflow')
        setSuites(outputSuites)
        if (outputSuites.length > 0 && !selectedSuiteId) {
          setSelectedSuiteId(outputSuites[0].id)
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [repoId, selectedVersionId, selectedSuiteId])

  // Load iterations for selected version
  const loadIterations = useCallback(async () => {
    if (!selectedVersionId) return
    try {
      const res = await fetch(`/api/skill-repos/${repoId}/versions/${selectedVersionId}/improve`)
      if (res.ok) {
        const data = await res.json()
        const iters = data.iterations || []
        setIterations(iters)
        if (iters.length > 0 && !selectedIteration) {
          setSelectedIteration(iters[iters.length - 1])
        }
      }
    } catch {
      // ignore
    }
  }, [repoId, selectedVersionId, selectedIteration])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    loadIterations()
  }, [loadIterations])

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingId) clearInterval(pollingId)
    }
  }, [pollingId])

  async function handleStartIteration() {
    if (!selectedVersionId || !selectedSuiteId) return
    setRunning(true)
    setError(null)

    try {
      const res = await fetch(`/api/skill-repos/${repoId}/versions/${selectedVersionId}/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evalSuiteId: selectedSuiteId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start iteration')
      }

      const data = await res.json()

      // Start polling for progress
      const interval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/skill-repos/${repoId}/versions/${selectedVersionId}/improve`)
          if (pollRes.ok) {
            const pollData = await pollRes.json()
            const iters = pollData.iterations || []
            setIterations(iters)

            const currentIter = iters.find((i: Iteration) => i.id === data.iterationId)
            if (currentIter) {
              setSelectedIteration(currentIter)
              setAcceptedIndices(new Set(currentIter.acceptedIndices || []))
              if (currentIter.status === 'completed' || currentIter.status === 'failed') {
                clearInterval(interval)
                setPollingId(null)
                setRunning(false)
              }
            }
          }
        } catch {
          // ignore polling errors
        }
      }, 5000)

      setPollingId(interval)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start iteration')
      setRunning(false)
    }
  }

  async function handleApplySuggestions() {
    if (!selectedIteration || acceptedIndices.size === 0) return
    setApplying(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/skill-repos/${repoId}/versions/${selectedVersionId}/improve/${selectedIteration.id}/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acceptedIndices: Array.from(acceptedIndices) }),
        }
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to apply suggestions')
      }

      const data = await res.json()

      // Reload data
      await loadData()
      await loadIterations()

      // Switch to the new version
      if (data.newVersionId) {
        setSelectedVersionId(data.newVersionId)
        setSelectedIteration(null)
        setIterations([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply suggestions')
    } finally {
      setApplying(false)
    }
  }

  function toggleSuggestion(index: number) {
    const next = new Set(acceptedIndices)
    if (next.has(index)) {
      next.delete(index)
    } else {
      next.add(index)
    }
    setAcceptedIndices(next)
  }

  function selectAllSuggestions() {
    if (!selectedIteration) return
    const suggestions = selectedIteration.suggestionsJson || []
    setAcceptedIndices(new Set(suggestions.map((_, i) => i)))
  }

  function deselectAllSuggestions() {
    setAcceptedIndices(new Set())
  }

  const priorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const categoryIcon = (c: string) => {
    switch (c) {
      case 'instructions': return 'Instructions'
      case 'tools': return 'Tools'
      case 'examples': return 'Examples'
      case 'error_handling': return 'Error Handling'
      case 'structure': return 'Structure'
      case 'references': return 'References'
      default: return c
    }
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'bg-green-400'
      case 'running': return 'bg-yellow-400 animate-pulse'
      case 'analyzing': return 'bg-blue-400 animate-pulse'
      case 'failed': return 'bg-red-400'
      default: return 'bg-muted-foreground'
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const analysis = selectedIteration?.analysisJson as AnalysisResult | undefined
  const suggestions = selectedIteration?.suggestionsJson || []
  const hasAnalysis = analysis && 'comparison_summary' in analysis

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href={`/skill-repos/${repoId}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ChevronLeft className="h-4 w-4" /> Back to Skill Repo
        </Link>
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-blue-400" />
          <h1 className="text-2xl font-bold">Improvement Loop</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Run eval → compare to baseline → analyze → get suggestions → apply improvements → repeat.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4 text-red-400 text-sm">
          <strong>Error:</strong> {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Controls */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Version selector */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Skill Version</label>
            <select
              value={selectedVersionId}
              onChange={(e) => {
                if (pollingId) {
                  clearInterval(pollingId)
                  setPollingId(null)
                  setRunning(false)
                }
                setSelectedVersionId(e.target.value)
                setSelectedIteration(null)
                setIterations([])
              }}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            >
              {versions.map(v => (
                <option key={v.id} value={v.id}>
                  {v.commitMessage.slice(0, 50)} ({v.gitCommitSha.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>

          {/* Suite selector */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Eval Suite</label>
            <select
              value={selectedSuiteId}
              onChange={(e) => setSelectedSuiteId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            >
              {suites.length === 0 && <option value="">No output suites available</option>}
              {suites.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.type})
                </option>
              ))}
            </select>
          </div>

          {/* Action */}
          <div className="flex items-end">
            <button
              onClick={handleStartIteration}
              disabled={running || !selectedVersionId || !selectedSuiteId}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 w-full justify-center"
            >
              {running ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Running iteration...</>
              ) : (
                <><Play className="h-4 w-4" /> Run Improvement Iteration</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Iteration Timeline */}
      {iterations.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="text-sm font-semibold">Iteration Timeline</span>
          </div>
          <div className="p-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {iterations.map(iter => (
                <button
                  key={iter.id}
                  onClick={() => {
                    setSelectedIteration(iter)
                    setAcceptedIndices(new Set(iter.acceptedIndices || []))
                  }}
                  className={`flex flex-col items-center gap-1 px-4 py-3 rounded-md border min-w-[120px] ${
                    selectedIteration?.id === iter.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${statusColor(iter.status)}`} />
                    <span className="text-sm font-semibold">#{iter.iterationNumber}</span>
                  </div>
                  {iter.passRate !== null && (
                    <span className="text-xs text-muted-foreground">
                      Pass: {(iter.passRate * 100).toFixed(0)}%
                    </span>
                  )}
                  {iter.skillWinRate !== null && (
                    <span className="text-xs text-muted-foreground">
                      Win: {(iter.skillWinRate * 100).toFixed(0)}%
                    </span>
                  )}
                  {iter.resultVersionId && (
                    <GitBranch className="h-3 w-3 text-green-400" />
                  )}
                </button>
              ))}
            </div>

            {/* Metrics trend */}
            {iterations.length > 1 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Metrics Trend</p>
                <div className="space-y-2">
                  {iterations.filter(i => i.passRate !== null).map(iter => (
                    <div key={iter.id} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground w-8">#{iter.iterationNumber}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-16">Pass Rate</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${(iter.passRate ?? 0) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono w-10 text-right">
                            {((iter.passRate ?? 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      {iter.avgDelta !== null && (
                        <span className={`text-xs font-mono ${iter.avgDelta > 0 ? 'text-green-400' : iter.avgDelta < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {iter.avgDelta > 0 ? '+' : ''}{iter.avgDelta.toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected Iteration Details */}
      {selectedIteration && (
        <div className="space-y-6">
          {/* Status banner */}
          {selectedIteration.status === 'running' && (
            <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-lg p-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-yellow-400 animate-spin" />
              <div>
                <p className="text-sm font-semibold text-yellow-400">Iteration in progress...</p>
                <p className="text-xs text-muted-foreground">Running eval, baseline comparison, and analysis. This may take several minutes.</p>
              </div>
            </div>
          )}

          {selectedIteration.status === 'analyzing' && (
            <div className="border border-blue-500/20 bg-blue-500/5 rounded-lg p-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
              <div>
                <p className="text-sm font-semibold text-blue-400">Analyzing results...</p>
                <p className="text-xs text-muted-foreground">The analyzer agent is generating improvement suggestions.</p>
              </div>
            </div>
          )}

          {selectedIteration.status === 'failed' && (
            <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4 flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-red-400">Iteration failed</p>
                <p className="text-xs text-muted-foreground">{selectedIteration.error}</p>
              </div>
            </div>
          )}

          {/* Metrics cards */}
          {selectedIteration.status === 'completed' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-border rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-foreground">
                  {selectedIteration.passRate !== null
                    ? `${(selectedIteration.passRate * 100).toFixed(0)}%`
                    : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Pass Rate</p>
              </div>
              <div className="border border-border rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-foreground">
                  {selectedIteration.skillWinRate !== null
                    ? `${(selectedIteration.skillWinRate * 100).toFixed(0)}%`
                    : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Skill Win Rate</p>
              </div>
              <div className="border border-border rounded-lg p-4 text-center">
                <p className={`text-3xl font-bold ${
                  (selectedIteration.avgDelta ?? 0) > 0 ? 'text-green-400' :
                  (selectedIteration.avgDelta ?? 0) < 0 ? 'text-red-400' :
                  'text-muted-foreground'
                }`}>
                  {selectedIteration.avgDelta !== null
                    ? `${selectedIteration.avgDelta > 0 ? '+' : ''}${selectedIteration.avgDelta.toFixed(2)}`
                    : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Avg Delta</p>
              </div>
              <div className="border border-border rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-foreground">
                  {suggestions.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Suggestions</p>
              </div>
            </div>
          )}

          {/* Analysis Results */}
          {hasAnalysis && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                <span className="text-sm font-semibold">Analysis Results</span>
              </div>
              <div className="p-4 space-y-4">
                {/* Comparison summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Winner</p>
                    <p className="text-sm font-semibold">
                      {analysis.comparison_summary.winner === 'skill' ? (
                        <span className="text-green-400">Skill wins</span>
                      ) : analysis.comparison_summary.winner === 'baseline' ? (
                        <span className="text-red-400">Baseline wins</span>
                      ) : (
                        <span className="text-yellow-400">Tie</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{analysis.comparison_summary.comparator_reasoning}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Instruction Following</p>
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-xs text-muted-foreground">Skill: </span>
                        <span className="text-sm font-semibold">{analysis.instruction_following.skill.score}/10</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Baseline: </span>
                        <span className="text-sm font-semibold">{analysis.instruction_following.baseline.score}/10</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Strengths & Weaknesses */}
                {analysis.winner_strengths.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Winner Strengths</p>
                    <ul className="space-y-1">
                      {analysis.winner_strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.loser_weaknesses.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Loser Weaknesses</p>
                    <ul className="space-y-1">
                      {analysis.loser_weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Transcript insights */}
                {(analysis.transcript_insights.skill_execution_pattern || analysis.transcript_insights.baseline_execution_pattern) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Skill Execution Pattern</p>
                      <p className="text-sm">{analysis.transcript_insights.skill_execution_pattern}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Baseline Execution Pattern</p>
                      <p className="text-sm">{analysis.transcript_insights.baseline_execution_pattern}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Improvement Suggestions */}
          {suggestions.length > 0 && selectedIteration.status === 'completed' && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  <span className="text-sm font-semibold">
                    Improvement Suggestions ({acceptedIndices.size}/{suggestions.length} selected)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllSuggestions}
                    className="text-xs px-2 py-1 border border-border rounded hover:bg-accent"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAllSuggestions}
                    className="text-xs px-2 py-1 border border-border rounded hover:bg-accent"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="divide-y divide-border">
                {suggestions.map((s, idx) => (
                  <div
                    key={idx}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      acceptedIndices.has(idx) ? 'bg-primary/5' : 'hover:bg-accent/30'
                    }`}
                    onClick={() => toggleSuggestion(idx)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center shrink-0 ${
                        acceptedIndices.has(idx)
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border'
                      }`}>
                        {acceptedIndices.has(idx) && <Check className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${priorityColor(s.priority)}`}>
                            {s.priority}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {categoryIcon(s.category)}
                          </span>
                        </div>
                        <p className="text-sm">{s.suggestion}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Expected impact: {s.expected_impact}
                        </p>
                        {s.evidence && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            Evidence: &quot;{s.evidence}&quot;
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Apply button */}
              {!selectedIteration.resultVersionId && (
                <div className="px-4 py-3 bg-muted/20 border-t border-border flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {acceptedIndices.size === 0
                      ? 'Select suggestions to apply'
                      : `${acceptedIndices.size} suggestion(s) selected — will create a new version`}
                  </p>
                  <button
                    onClick={handleApplySuggestions}
                    disabled={applying || acceptedIndices.size === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {applying ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Applying...</>
                    ) : (
                      <><Check className="h-4 w-4" /> Apply Selected &amp; Create New Version</>
                    )}
                  </button>
                </div>
              )}

              {selectedIteration.resultVersionId && (
                <div className="px-4 py-3 bg-green-500/5 border-t border-green-500/20 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <p className="text-sm text-green-400">
                    Suggestions applied — new version created.
                  </p>
                  <Link
                    href={`/skill-repos/${repoId}`}
                    className="text-sm text-green-400 underline ml-auto"
                  >
                    View version
                  </Link>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Empty state */}
      {iterations.length === 0 && !loading && (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No iterations yet</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Select a version and eval suite, then click &quot;Run Improvement Iteration&quot; to start the improvement loop.
          </p>
        </div>
      )}
    </div>
  )
}
