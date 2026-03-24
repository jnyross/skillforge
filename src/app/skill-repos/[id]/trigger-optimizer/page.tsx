"use client"

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Play, Loader2, CheckCircle, XCircle,
  Zap, TrendingUp, ArrowRight, Trophy, RotateCcw,
} from 'lucide-react'
import { useTechLevel, toTitleCase } from '@/lib/context/tech-level-context'

interface TriggerQuery {
  query: string
  shouldTrigger: boolean
  reasoning: string
}

interface IterationData {
  iteration: number
  description: string
  trainScore: number
  testScore: number
  improvementReason: string
}

interface OptimizationProgress {
  runId: string
  status: string
  currentIteration: number
  maxIterations: number
  bestTestScore: number
  bestTrainScore: number
  bestDescription: string
  originalDescription: string
  iterations: IterationData[]
}

interface OptimizationRun {
  id: string
  status: string
  currentIteration: number
  maxIterations: number
  bestTestScore: number
  bestTrainScore: number
  bestDescription: string
  originalDescription: string
  queriesJson: string
  trainIndices: string
  testIndices: string
  createdAt: string
  completedAt: string | null
  iterations: IterationData[]
}

export default function TriggerOptimizerPage() {
  const params = useParams()
  const repoId = params.id as string
  const { terms } = useTechLevel()

  const [runs, setRuns] = useState<OptimizationRun[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [running, setRunning] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<OptimizationRun | null>(null)
  const [progress, setProgress] = useState<OptimizationProgress | null>(null)
  const [expandedIter, setExpandedIter] = useState<number | null>(null)
  const [editingQueries, setEditingQueries] = useState(false)
  const [editedQueries, setEditedQueries] = useState<TriggerQuery[]>([])

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/skill-repos/${repoId}/optimize-trigger`)
      if (res.ok) {
        const data = await res.json()
        setRuns(data)
        if (data.length > 0 && !selectedRun) {
          setSelectedRun(data[0])
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [repoId, selectedRun])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  async function handleStart() {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch(`/api/skill-repos/${repoId}/optimize-trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxIterations: 5 }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start optimization')
      }
      await loadRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  async function handleRunLoop(runId: string) {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/skill-repos/${repoId}/optimize-trigger/${runId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Optimization failed')
      }
      const data = await res.json()
      setProgress(data)
      await loadRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed')
    } finally {
      setRunning(false)
    }
  }

  async function handlePromote(runId: string) {
    setPromoting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/skill-repos/${repoId}/optimize-trigger/${runId}?action=promote`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      )
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Promote failed')
      }
      await loadRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promote failed')
    } finally {
      setPromoting(false)
    }
  }

  async function handleSaveQueries(runId: string) {
    try {
      const res = await fetch(`/api/skill-repos/${repoId}/optimize-trigger/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queriesJson: editedQueries }),
      })
      if (res.ok) {
        setEditingQueries(false)
        await loadRuns()
      }
    } catch {
      // ignore
    }
  }

  const queries: TriggerQuery[] = selectedRun ? JSON.parse(selectedRun.queriesJson || '[]') : []
  const trainIndices: number[] = selectedRun ? JSON.parse(selectedRun.trainIndices || '[]') : []
  const testIndices: number[] = selectedRun ? JSON.parse(selectedRun.testIndices || '[]') : []
  const iterations = selectedRun?.iterations || progress?.iterations || []

  const scoreColor = (score: number) => {
    if (score >= 0.9) return 'text-green-400'
    if (score >= 0.7) return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href={`/skill-repos/${repoId}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ChevronLeft className="h-4 w-4" /> Back to Skill Repo
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6 text-yellow-400" />
            <h1 className="text-2xl font-bold">{toTitleCase(terms.triggerDescription)} Optimizer</h1>
          </div>
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {starting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating queries...</>
            ) : (
              <><Play className="h-4 w-4" /> New Optimization Run</>
            )}
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Automatically optimize the trigger description using train/test evaluation with iterative improvement.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4 text-red-400 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && <div className="text-center py-12 text-muted-foreground">Loading...</div>}

      {!loading && runs.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No optimization runs yet</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Click &quot;New Optimization Run&quot; to generate trigger evaluation queries and optimize your description.
          </p>
        </div>
      )}

      {/* Run list */}
      {runs.length > 0 && (
        <div className="space-y-4">
          {/* Run selector */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {runs.map(run => (
              <button
                key={run.id}
                onClick={() => { setSelectedRun(run); setProgress(null) }}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm whitespace-nowrap ${
                  selectedRun?.id === run.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${
                  run.status === 'completed' ? 'bg-green-400' :
                  run.status === 'running' ? 'bg-yellow-400 animate-pulse' :
                  run.status === 'failed' ? 'bg-red-400' :
                  'bg-muted-foreground'
                }`} />
                <span className="font-mono text-xs">{run.id.slice(0, 8)}</span>
                <span className="text-muted-foreground">
                  {run.status === 'completed' ? `${(run.bestTestScore * 100).toFixed(0)}%` : run.status}
                </span>
              </button>
            ))}
          </div>

          {selectedRun && (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border border-border rounded-lg p-4 text-center">
                  <p className={`text-3xl font-bold ${scoreColor(selectedRun.bestTestScore)}`}>
                    {(selectedRun.bestTestScore * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Best {terms.testSplit} Score</p>
                </div>
                <div className="border border-border rounded-lg p-4 text-center">
                  <p className={`text-3xl font-bold ${scoreColor(selectedRun.bestTrainScore)}`}>
                    {(selectedRun.bestTrainScore * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Best {terms.trainSplit} Score</p>
                </div>
                <div className="border border-border rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-foreground">
                    {selectedRun.currentIteration}/{selectedRun.maxIterations}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Iterations</p>
                </div>
                <div className="border border-border rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-foreground">
                    {queries.length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{terms.evalCase}s</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                {(selectedRun.status === 'reviewing' || selectedRun.status === 'generating-queries') && (
                  <button
                    onClick={() => handleRunLoop(selectedRun.id)}
                    disabled={running}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                  >
                    {running ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Running optimization...</>
                    ) : (
                      <><Play className="h-4 w-4" /> Start Optimization Loop</>
                    )}
                  </button>
                )}
                {selectedRun.status === 'completed' && (
                  <button
                    onClick={() => handlePromote(selectedRun.id)}
                    disabled={promoting}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {promoting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Promoting...</>
                    ) : (
                      <><Trophy className="h-4 w-4" /> Promote Best Description</>
                    )}
                  </button>
                )}
              </div>

              {/* Description diff */}
              {selectedRun.bestDescription && selectedRun.bestDescription !== selectedRun.originalDescription && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    <span className="text-sm font-semibold">Description Change</span>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <div className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">Original</p>
                      <p className="text-sm text-red-400/80 line-through">{selectedRun.originalDescription}</p>
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">Best (test score: {(selectedRun.bestTestScore * 100).toFixed(0)}%)</p>
                      <p className="text-sm text-green-400">{selectedRun.bestDescription}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Score chart (iteration progression) */}
              {iterations.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm font-semibold">Score Progression</span>
                  </div>
                  <div className="p-4">
                    {/* Simple bar chart */}
                    <div className="space-y-3">
                      {iterations.map(iter => (
                        <div
                          key={iter.iteration}
                          className={`cursor-pointer rounded-md p-3 border ${
                            expandedIter === iter.iteration ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'
                          }`}
                          onClick={() => setExpandedIter(expandedIter === iter.iteration ? null : iter.iteration)}
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-mono text-muted-foreground w-8">#{iter.iteration}</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs text-muted-foreground w-10">Train</span>
                                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full transition-all"
                                    style={{ width: `${iter.trainScore * 100}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-mono w-10 text-right ${scoreColor(iter.trainScore)}`}>
                                  {(iter.trainScore * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-10">Test</span>
                                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-green-500 rounded-full transition-all"
                                    style={{ width: `${iter.testScore * 100}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-mono w-10 text-right ${scoreColor(iter.testScore)}`}>
                                  {(iter.testScore * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                            {iter.testScore === selectedRun.bestTestScore && iter.trainScore === selectedRun.bestTrainScore && (
                              <Trophy className="h-4 w-4 text-yellow-400" />
                            )}
                          </div>

                          {expandedIter === iter.iteration && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <p className="text-xs text-muted-foreground mb-1">Description used:</p>
                              <p className="text-sm font-mono bg-muted/30 p-2 rounded">{iter.description}</p>
                              {iter.improvementReason && (
                                <>
                                  <p className="text-xs text-muted-foreground mt-2 mb-1">Improvement reason:</p>
                                  <p className="text-sm text-muted-foreground">{iter.improvementReason}</p>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Query list */}
              {queries.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      Trigger Eval Queries ({queries.filter(q => q.shouldTrigger).length} positive, {queries.filter(q => !q.shouldTrigger).length} negative)
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedRun.status === 'reviewing' && !editingQueries && (
                        <button
                          onClick={() => { setEditingQueries(true); setEditedQueries([...queries]) }}
                          className="text-xs px-2 py-1 border border-border rounded hover:bg-accent"
                        >
                          Edit Queries
                        </button>
                      )}
                      {editingQueries && (
                        <>
                          <button
                            onClick={() => setEditingQueries(false)}
                            className="text-xs px-2 py-1 border border-border rounded hover:bg-accent"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveQueries(selectedRun.id)}
                            className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                          >
                            Save
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-border max-h-96 overflow-y-auto">
                    {queries.map((q, idx) => (
                      <div key={idx} className="px-4 py-2 flex items-start gap-3 text-sm">
                        <span className="text-xs font-mono text-muted-foreground w-6 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded mt-0.5 ${
                          q.shouldTrigger
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {q.shouldTrigger ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {q.shouldTrigger ? 'YES' : 'NO'}
                        </span>
                        <div className="flex-1">
                          {editingQueries ? (
                            <input
                              value={editedQueries[idx]?.query || ''}
                              onChange={e => {
                                const updated = [...editedQueries]
                                updated[idx] = { ...updated[idx], query: e.target.value }
                                setEditedQueries(updated)
                              }}
                              className="w-full bg-muted/30 border border-border rounded px-2 py-1 text-sm"
                            />
                          ) : (
                            <span>{q.query}</span>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">{q.reasoning}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          trainIndices.includes(idx)
                            ? 'bg-blue-500/20 text-blue-400'
                            : testIndices.includes(idx)
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {trainIndices.includes(idx) ? 'TRAIN' : testIndices.includes(idx) ? 'TEST' : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
