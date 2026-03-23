'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Zap, ArrowLeft, Square, Trophy, Clock, Target,
  DollarSign, GitBranch, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, Loader2,
} from 'lucide-react'

interface Mutation {
  id: string
  operator: string
  target: string
  beforeSnippet: string
  afterSnippet: string
}

interface Candidate {
  id: string
  parentVersionId: string
  candidateVersionId: string | null
  mutationType: string
  rationale: string
  patchDiff: string
  status: string
  objectiveJson: string
  error: string | null
  createdAt: string
  completedAt: string | null
  parentVersion: { id: string; commitMessage: string; gitCommitSha: string } | null
  candidateVersion: { id: string; commitMessage: string; gitCommitSha: string } | null
  mutations: Mutation[]
}

interface Decision {
  id: string
  candidateId: string | null
  decision: string
  reason: string
  metricsJson: string
  humanApproved: boolean
  createdAt: string
}

interface OptimizerRunDetail {
  id: string
  skillRepoId: string
  baselineVersionId: string
  suiteIds: string
  maxIterations: number
  maxBudgetUsd: number | null
  status: string
  currentIteration: number
  objectiveJson: string
  promotionRules: string
  jobId: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  skillRepo: { displayName: string; slug: string }
  candidates: Candidate[]
  decisions: Decision[]
}

export default function OptimizerRunDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [run, setRun] = useState<OptimizerRunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set())
  const [promoting, setPromoting] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [starting, setStarting] = useState(false)

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/optimizer-runs/${params.id}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setRun(data)
      setError('')
    } catch {
      setError('Failed to load optimizer run')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchRun()
  }, [fetchRun])

  // Auto-refresh while running
  useEffect(() => {
    if (!run || run.status !== 'running') return
    const interval = setInterval(fetchRun, 3000)
    return () => clearInterval(interval)
  }, [run, fetchRun])

  const handleStart = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/optimizer-runs/${params.id}/start`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to start')
        return
      }
      await fetchRun()
    } catch {
      setError('Failed to start optimizer run')
    } finally {
      setStarting(false)
    }
  }

  const handleStop = async () => {
    setStopping(true)
    try {
      const res = await fetch(`/api/optimizer-runs/${params.id}/stop`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to stop')
        return
      }
      await fetchRun()
    } catch {
      setError('Failed to stop optimizer run')
    } finally {
      setStopping(false)
    }
  }

  const handlePromote = async (candidateId: string) => {
    setPromoting(candidateId)
    try {
      const res = await fetch(`/api/optimizer-runs/${params.id}/promote/${candidateId}`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to promote')
        return
      }
      await fetchRun()
    } catch {
      setError('Failed to promote candidate')
    } finally {
      setPromoting(null)
    }
  }

  const toggleCandidate = (id: string) => {
    setExpandedCandidates(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const statusColors: Record<string, string> = {
    queued: 'bg-gray-500/10 text-gray-400',
    running: 'bg-blue-500/10 text-blue-400',
    completed: 'bg-green-500/10 text-green-400',
    stopped: 'bg-amber-500/10 text-amber-400',
    failed: 'bg-red-500/10 text-red-400',
    keep: 'bg-green-500/10 text-green-400',
    discard: 'bg-red-500/10 text-red-400',
    crash: 'bg-red-500/10 text-red-400',
    blocked: 'bg-amber-500/10 text-amber-400',
  }

  const statusIcons: Record<string, React.ReactNode> = {
    keep: <CheckCircle2 className="h-4 w-4 text-green-400" />,
    discard: <XCircle className="h-4 w-4 text-red-400" />,
    crash: <AlertTriangle className="h-4 w-4 text-red-400" />,
    running: <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />,
    queued: <Clock className="h-4 w-4 text-gray-400" />,
    blocked: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>
  if (!run) return <div className="p-6 text-red-400">{error || 'Run not found'}</div>

  const progress = run.maxIterations > 0
    ? (run.currentIteration / run.maxIterations) * 100
    : 0

  const keptCount = run.candidates.filter(c => c.status === 'keep').length
  const discardedCount = run.candidates.filter(c => c.status === 'discard').length
  const crashedCount = run.candidates.filter(c => c.status === 'crash').length

  // Parse objective weights for display
  let objectiveWeights: Record<string, number> = {}
  try {
    objectiveWeights = JSON.parse(run.objectiveJson || '{}')
  } catch { /* ignore */ }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/optimizer" className="hover:text-foreground">Optimizer</Link>
        <span>/</span>
        <span className="text-foreground">{run.skillRepo.displayName}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/optimizer')} className="p-1 hover:bg-accent rounded">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6" />
              {run.skillRepo.displayName}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Optimizer Run &middot; Iteration {run.currentIteration}/{run.maxIterations}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] || ''}`}>
            {run.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {run.status === 'queued' && (
            <button
              onClick={handleStart}
              disabled={starting}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Start
            </button>
          )}
          {(run.status === 'running' || run.status === 'queued') && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 disabled:opacity-50"
            >
              {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Stop
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span>{run.currentIteration}/{run.maxIterations} iterations</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${run.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-primary'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Target className="h-4 w-4" />
            <span>Candidates</span>
          </div>
          <div className="text-2xl font-bold">{run.candidates.length}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {keptCount} kept &middot; {discardedCount} discarded &middot; {crashedCount} crashed
          </div>
        </div>

        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <CheckCircle2 className="h-4 w-4" />
            <span>Keep Rate</span>
          </div>
          <div className="text-2xl font-bold">
            {run.candidates.length > 0
              ? `${((keptCount / run.candidates.length) * 100).toFixed(0)}%`
              : '—'}
          </div>
        </div>

        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Clock className="h-4 w-4" />
            <span>Duration</span>
          </div>
          <div className="text-2xl font-bold">
            {run.startedAt
              ? formatDuration(
                  new Date(run.completedAt || new Date()).getTime() -
                  new Date(run.startedAt).getTime()
                )
              : '—'}
          </div>
        </div>

        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            <span>Budget</span>
          </div>
          <div className="text-2xl font-bold">
            {run.maxBudgetUsd != null ? `$${run.maxBudgetUsd.toFixed(2)}` : 'Unlimited'}
          </div>
        </div>
      </div>

      {/* Objective function display */}
      {Object.keys(objectiveWeights).length > 0 && (
        <div className="border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Objective Weights</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(objectiveWeights).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{formatWeightName(key)}</span>
                <span className="font-mono">{((value as number) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Candidate table */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Candidates
        </h2>

        {run.candidates.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
            No candidates generated yet. {run.status === 'queued' ? 'Start the optimizer to begin.' : ''}
          </div>
        ) : (
          <div className="space-y-2">
            {run.candidates.map((candidate, index) => (
              <div key={candidate.id} className="border border-border rounded-lg overflow-hidden">
                {/* Candidate header */}
                <button
                  onClick={() => toggleCandidate(candidate.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {expandedCandidates.has(candidate.id)
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    }
                    {statusIcons[candidate.status] || <Clock className="h-4 w-4" />}
                    <span className="font-medium">#{index + 1}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[candidate.status] || ''}`}>
                      {candidate.status}
                    </span>
                    <span className="text-sm text-muted-foreground">{candidate.mutationType}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {candidate.status === 'keep' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePromote(candidate.id) }}
                        disabled={promoting === candidate.id}
                        className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                      >
                        {promoting === candidate.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Trophy className="h-3 w-3" />
                        }
                        Promote
                      </button>
                    )}
                    {getObjectiveScore(candidate.objectiveJson) !== null && (
                      <span className="text-sm font-mono">
                        {((getObjectiveScore(candidate.objectiveJson) ?? 0) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded candidate detail */}
                {expandedCandidates.has(candidate.id) && (
                  <div className="border-t border-border p-4 space-y-4 bg-accent/20">
                    {/* Rationale */}
                    <div>
                      <h4 className="text-sm font-medium mb-1">Rationale</h4>
                      <p className="text-sm text-muted-foreground">{candidate.rationale || 'No rationale provided'}</p>
                    </div>

                    {/* Error */}
                    {candidate.error && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
                        <h4 className="text-sm font-medium text-red-400 mb-1">Error</h4>
                        <p className="text-sm text-red-300 font-mono">{candidate.error}</p>
                      </div>
                    )}

                    {/* Mutations */}
                    {candidate.mutations.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Mutations ({candidate.mutations.length})</h4>
                        <div className="space-y-2">
                          {candidate.mutations.map(mutation => (
                            <div key={mutation.id} className="border border-border rounded p-3 text-sm">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                  {mutation.operator}
                                </span>
                                <span className="text-muted-foreground">&rarr;</span>
                                <span className="text-muted-foreground">{mutation.target}</span>
                              </div>
                              {mutation.beforeSnippet && (
                                <div className="font-mono text-xs bg-red-500/5 border border-red-500/10 rounded p-2 mb-1">
                                  <span className="text-red-400">- </span>
                                  {mutation.beforeSnippet.slice(0, 200)}
                                </div>
                              )}
                              {mutation.afterSnippet && (
                                <div className="font-mono text-xs bg-green-500/5 border border-green-500/10 rounded p-2">
                                  <span className="text-green-400">+ </span>
                                  {mutation.afterSnippet.slice(0, 200)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Diff preview */}
                    {candidate.patchDiff && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Diff</h4>
                        <pre className="font-mono text-xs bg-card border border-border rounded p-3 overflow-x-auto max-h-64 overflow-y-auto">
                          {candidate.patchDiff.split('\n').map((line, i) => (
                            <div
                              key={i}
                              className={
                                line.startsWith('+') ? 'text-green-400' :
                                line.startsWith('-') ? 'text-red-400' :
                                'text-muted-foreground'
                              }
                            >
                              {line}
                            </div>
                          ))}
                        </pre>
                      </div>
                    )}

                    {/* Objective score breakdown */}
                    {candidate.objectiveJson && candidate.objectiveJson !== '{}' && (
                      <ObjectiveBreakdown json={candidate.objectiveJson} />
                    )}

                    {/* Version info */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {candidate.parentVersion && (
                        <span>Parent: {candidate.parentVersion.gitCommitSha.slice(0, 7)}</span>
                      )}
                      {candidate.candidateVersion && (
                        <span>Candidate: {candidate.candidateVersion.gitCommitSha.slice(0, 7)}</span>
                      )}
                      <span>Created: {new Date(candidate.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decision log */}
      {run.decisions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Decision Log</h2>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-accent/30">
                  <th className="text-left p-3">Decision</th>
                  <th className="text-left p-3">Reason</th>
                  <th className="text-left p-3">Human Approved</th>
                  <th className="text-left p-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {run.decisions.map(decision => (
                  <tr key={decision.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[decision.decision] || 'bg-gray-500/10 text-gray-400'}`}>
                        {decision.decision}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground max-w-md truncate">
                      {decision.reason}
                    </td>
                    <td className="p-3">
                      {decision.humanApproved ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(decision.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ObjectiveBreakdown({ json }: { json: string }) {
  let objective: {
    totalScore?: number
    components?: Record<string, number>
  } = {}
  try {
    objective = JSON.parse(json)
  } catch {
    return null
  }

  if (!objective.components) return null

  return (
    <div>
      <h4 className="text-sm font-medium mb-2">
        Objective Score: {((objective.totalScore || 0) * 100).toFixed(1)}%
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Object.entries(objective.components).map(([key, value]) => (
          <div key={key} className="text-xs">
            <span className="text-muted-foreground">{formatWeightName(key)}: </span>
            <span className={`font-mono ${key.includes('Penalty') && value > 0 ? 'text-red-400' : ''}`}>
              {(value * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function getObjectiveScore(json: string): number | null {
  try {
    const obj = JSON.parse(json || '{}')
    return obj.totalScore ?? null
  } catch {
    return null
  }
}

function formatWeightName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}
