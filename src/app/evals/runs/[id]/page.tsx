'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, CheckCircle, XCircle, Clock, AlertCircle,
  Loader2, Activity, BarChart3, RotateCcw, ArrowUpRight, Scale
} from 'lucide-react'
import { useTechLevel } from '@/lib/context/tech-level-context'

interface EvalRunDetail {
  id: string
  status: string
  executorType: string
  model: string
  effort: string
  maxTurns: number
  metricsJson: string
  error: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  skillRepo: { id: string; displayName: string; slug: string }
  suite: { id: string; name: string; type: string }
  skillVersion: { id: string; commitMessage: string; gitCommitSha: string }
  baselineVersion: { id: string; commitMessage: string; gitCommitSha: string } | null
  caseRuns: CaseRun[]
  benchmarkSnapshots: BenchmarkSnapshot[]
}

interface CaseRun {
  id: string
  status: string
  durationMs: number | null
  costUsd: number | null
  triggerResult: boolean | null
  outputJson: string
  error: string | null
  traceId: string | null
  evalCase: { id: string; name: string; key: string; prompt: string; shouldTrigger: boolean | null }
  assertions: AssertionResult[]
}

interface AssertionResult {
  id: string
  name: string
  type: string
  passed: boolean
  expected: string
  actual: string
  message: string
}

interface BenchmarkSnapshot {
  id: string
  totalCases: number
  passedCases: number
  failedCases: number
  passRate: number
  avgDurationMs: number | null
  totalCostUsd: number | null
  metricsJson: string
}

interface TraceItem {
  id: string
  status: string
  model: string
  totalDurationMs: number | null
  totalTokens: number | null
  createdAt: string
  _count: { toolEvents: number; artifacts: number }
  caseRuns: Array<{ id: string; status: string; evalCase: { name: string; key: string } }>
}

export default function EvalRunDetailPage() {
  const params = useParams()
  const runId = params.id as string
  const { terms } = useTechLevel()

  const [run, setRun] = useState<EvalRunDetail | null>(null)
  const [traces, setTraces] = useState<TraceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'results' | 'metrics' | 'traces'>('results')
  const [rerunning, setRerunning] = useState(false)
  const [selectedFailedRuns, setSelectedFailedRuns] = useState<Set<string>>(new Set())
  const [promoting, setPromoting] = useState(false)

  const loadRun = useCallback(async () => {
    const res = await fetch(`/api/eval-runs/${runId}`)
    if (res.ok) setRun(await res.json())
  }, [runId])

  const loadTraces = useCallback(async () => {
    const res = await fetch(`/api/eval-runs/${runId}/traces`)
    if (res.ok) setTraces(await res.json())
  }, [runId])

  useEffect(() => {
    Promise.all([loadRun(), loadTraces()]).then(() => setLoading(false))
  }, [loadRun, loadTraces])

  // Auto-refresh while running
  useEffect(() => {
    if (run?.status === 'running' || run?.status === 'queued') {
      const interval = setInterval(() => {
        loadRun()
        loadTraces()
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [run?.status, loadRun, loadTraces])

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': case 'passed': return <CheckCircle className="h-4 w-4 text-green-400" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-400" />
      case 'running': return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
      case 'queued': case 'pending': return <Clock className="h-4 w-4 text-yellow-400" />
      case 'error': return <AlertCircle className="h-4 w-4 text-red-400" />
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />
    }
  }

  const handleRerun = async () => {
    setRerunning(true)
    const res = await fetch(`/api/eval-runs/${runId}/rerun`, { method: 'POST' })
    if (res.ok) {
      const newRun = await res.json()
      await fetch(`/api/eval-runs/${newRun.id}/start`, { method: 'POST' })
      window.location.href = `/evals/runs/${newRun.id}`
    }
    setRerunning(false)
  }

  const toggleFailedRun = (id: string) => {
    setSelectedFailedRuns(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBatchPromote = async () => {
    if (selectedFailedRuns.size === 0) return
    setPromoting(true)
    await fetch(`/api/eval-runs/${runId}/batch-promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseRunIds: Array.from(selectedFailedRuns) }),
    })
    setSelectedFailedRuns(new Set())
    setPromoting(false)
    loadRun()
  }

  if (loading || !run) {
    return <div className="p-6 text-muted-foreground">Loading...</div>
  }

  const metrics = (() => { try { return JSON.parse(run.metricsJson) } catch { return {} } })()
  const benchmark = run.benchmarkSnapshots[0]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href={`/evals/${run.suite.id}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ChevronLeft className="h-4 w-4" /> Back to {run.suite.name}
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {statusIcon(run.status)}
            <h1 className="text-2xl font-bold">Eval Run</h1>
            <span className="text-sm text-muted-foreground font-mono">{run.id.slice(0, 8)}</span>
          </div>
          <div className="flex items-center gap-2">
            {run.status === 'running' && (
              <span className="flex items-center gap-2 text-sm text-blue-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Running...
              </span>
            )}
            {(run.status === 'completed' || run.status === 'failed') && (
              <button
                onClick={handleRerun}
                disabled={rerunning}
                className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" /> {rerunning ? 'Rerunning...' : 'Rerun'}
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Suite</p>
            <p className="font-medium">{run.suite.name}</p>
          </div>
          <div className="border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Version</p>
            <p className="font-medium text-sm">{run.skillVersion.commitMessage}</p>
            <p className="text-xs text-muted-foreground font-mono">{run.skillVersion.gitCommitSha.slice(0, 7)}</p>
          </div>
          <div className="border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Executor</p>
            <p className="font-medium">{run.executorType}</p>
            <p className="text-xs text-muted-foreground">{run.model}</p>
          </div>
          <div className="border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="font-medium">
              {run.startedAt && run.completedAt
                ? `${((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)}s`
                : run.startedAt ? 'In progress...' : 'Pending'}
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {run.error && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4 text-red-400 text-sm">
          <strong>Error:</strong> {run.error}
        </div>
      )}

      {/* Summary bar */}
      {benchmark && (
        <div className="flex gap-6 border border-border rounded-lg p-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{(benchmark.passRate * 100).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">{terms.passRate}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">{benchmark.passedCases}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">{benchmark.failedCases}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{benchmark.totalCases}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          {benchmark.avgDurationMs != null && (
            <div className="text-center">
              <p className="text-2xl font-bold">{(benchmark.avgDurationMs / 1000).toFixed(1)}s</p>
              <p className="text-xs text-muted-foreground">Avg Duration</p>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border">
        <button onClick={() => setTab('results')} className={`pb-2 text-sm font-medium border-b-2 ${tab === 'results' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          {terms.evalCase} Results ({run.caseRuns.length})
        </button>
        <button onClick={() => setTab('metrics')} className={`pb-2 text-sm font-medium border-b-2 ${tab === 'metrics' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <BarChart3 className="h-4 w-4 inline mr-1" /> Metrics
        </button>
        <button onClick={() => setTab('traces')} className={`pb-2 text-sm font-medium border-b-2 ${tab === 'traces' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Activity className="h-4 w-4 inline mr-1" /> Traces ({traces.length})
        </button>
        {run.status === 'completed' && (
          <Link
            href={`/evals/runs/${runId}/comparison`}
            className="pb-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Scale className="h-4 w-4" /> Blind Comparison
          </Link>
        )}
      </div>

      {/* Case Results */}
      {tab === 'results' && (
        <div className="space-y-3">
          {/* Batch promote toolbar */}
          {run.caseRuns.some(cr => cr.status === 'failed') && (
            <div className="flex items-center gap-3 text-sm">
              <button
                onClick={() => {
                  const failedIds = run.caseRuns.filter(cr => cr.status === 'failed').map(cr => cr.id)
                  setSelectedFailedRuns(prev => prev.size === failedIds.length ? new Set() : new Set(failedIds))
                }}
                className="px-3 py-1.5 border border-border rounded-md hover:bg-accent"
              >
                {selectedFailedRuns.size === run.caseRuns.filter(cr => cr.status === 'failed').length ? 'Deselect All' : 'Select All Failed'}
              </button>
              {selectedFailedRuns.size > 0 && (
                <button
                  onClick={handleBatchPromote}
                  disabled={promoting}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  {promoting ? 'Promoting...' : `Promote ${selectedFailedRuns.size} to Eval Cases`}
                </button>
              )}
            </div>
          )}
          {run.caseRuns.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {run.status === 'queued' || run.status === 'running' ? 'Waiting for results...' : 'No case results.'}
            </div>
          ) : (
            run.caseRuns.map(cr => (
              <div key={cr.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {cr.status === 'failed' && (
                      <input
                        type="checkbox"
                        checked={selectedFailedRuns.has(cr.id)}
                        onChange={() => toggleFailedRun(cr.id)}
                        className="h-4 w-4 rounded border-border"
                      />
                    )}
                    {statusIcon(cr.status)}
                    <span className="font-medium">{cr.evalCase.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{cr.evalCase.key}</span>
                    {cr.evalCase.shouldTrigger !== null && (
                      <span className={`px-2 py-0.5 rounded text-xs ${cr.evalCase.shouldTrigger ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        expect: {cr.evalCase.shouldTrigger ? 'trigger' : 'no trigger'}
                      </span>
                    )}
                    {cr.triggerResult !== null && (
                      <span className={`px-2 py-0.5 rounded text-xs ${cr.triggerResult ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-400'}`}>
                        actual: {cr.triggerResult ? 'triggered' : 'not triggered'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {cr.durationMs != null && <span>{(cr.durationMs / 1000).toFixed(1)}s</span>}
                    {cr.traceId && (
                      <Link href={`/traces/${cr.traceId}`} className="text-blue-400 hover:underline text-xs">
                        View Trace
                      </Link>
                    )}
                  </div>
                </div>
                {cr.error && <p className="text-sm text-red-400 mt-2">{cr.error}</p>}
                {cr.assertions.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {cr.assertions.map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-sm">
                        {a.passed ? <CheckCircle className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                        <span className="text-muted-foreground">{a.type}:</span>
                        <span>{a.message || (a.passed ? 'Passed' : 'Failed')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Metrics */}
      {tab === 'metrics' && (
        <div className="space-y-4">
          {Object.keys(metrics).length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No metrics available yet.</div>
          ) : (
            <>
              <div className="border border-border rounded-lg p-4">
                <h3 className="font-medium mb-3">Benchmark Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {metrics.passRate != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Pass Rate</p>
                      <p className="text-xl font-bold">{(metrics.passRate * 100).toFixed(1)}%</p>
                    </div>
                  )}
                  {metrics.totalCases != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Total Cases</p>
                      <p className="text-xl font-bold">{metrics.totalCases}</p>
                    </div>
                  )}
                  {metrics.duration?.mean != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Duration</p>
                      <p className="text-xl font-bold">{(metrics.duration.mean / 1000).toFixed(1)}s</p>
                    </div>
                  )}
                  {metrics.cost?.total != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Total Cost</p>
                      <p className="text-xl font-bold">${metrics.cost.total.toFixed(4)}</p>
                    </div>
                  )}
                </div>
              </div>

              {metrics.trigger && (
                <div className="border border-border rounded-lg p-4">
                  <h3 className="font-medium mb-3">Trigger Metrics</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {metrics.trigger.overall && (
                      <>
                        <div>
                          <p className="text-xs text-muted-foreground">Precision</p>
                          <p className="text-xl font-bold">{(metrics.trigger.overall.precision * 100).toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Recall</p>
                          <p className="text-xl font-bold">{(metrics.trigger.overall.recall * 100).toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">F1</p>
                          <p className="text-xl font-bold">{(metrics.trigger.overall.f1 * 100).toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Overall Pass Rate</p>
                          <p className="text-xl font-bold">{(metrics.trigger.overall.overallPassRate * 100).toFixed(1)}%</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {metrics.baseline && (
                <div className="border border-border rounded-lg p-4">
                  <h3 className="font-medium mb-3">Baseline Comparison</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Delta</p>
                      <p className={`text-xl font-bold ${metrics.baseline.delta > 0 ? 'text-green-400' : metrics.baseline.delta < 0 ? 'text-red-400' : ''}`}>
                        {metrics.baseline.delta > 0 ? '+' : ''}{(metrics.baseline.delta * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Wins</p>
                      <p className="text-xl font-bold text-green-400">{metrics.baseline.wins}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Losses</p>
                      <p className="text-xl font-bold text-red-400">{metrics.baseline.losses}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Ties</p>
                      <p className="text-xl font-bold">{metrics.baseline.ties}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="border border-border rounded-lg p-4">
                <h3 className="font-medium mb-3">Raw Metrics JSON</h3>
                <pre className="text-xs bg-black/30 p-3 rounded overflow-auto max-h-64">
                  {JSON.stringify(metrics, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>
      )}

      {/* Traces */}
      {tab === 'traces' && (
        <div className="space-y-3">
          {traces.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No traces captured yet.</div>
          ) : (
            traces.map(trace => (
              <Link
                key={trace.id}
                href={`/traces/${trace.id}`}
                className="block border border-border rounded-lg p-4 hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {statusIcon(trace.status)}
                    <span className="font-mono text-sm">{trace.id.slice(0, 12)}</span>
                    {trace.caseRuns.map(cr => (
                      <span key={cr.id} className="text-sm text-muted-foreground">{cr.evalCase.name}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{trace._count.toolEvents} tool calls</span>
                    <span>{trace._count.artifacts} artifacts</span>
                    {trace.totalDurationMs && <span>{(trace.totalDurationMs / 1000).toFixed(1)}s</span>}
                    {trace.totalTokens && <span>{trace.totalTokens} tokens</span>}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
