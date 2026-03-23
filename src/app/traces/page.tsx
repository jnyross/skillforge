'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Activity, CheckCircle, XCircle, Clock, AlertCircle,
  Loader2, Filter, ChevronRight, BarChart3, Layers
} from 'lucide-react'

interface TraceItem {
  id: string
  sessionId: string
  model: string
  status: string
  totalDurationMs: number | null
  totalCostUsd: number | null
  totalTokens: number | null
  error: string | null
  createdAt: string
  evalRun: {
    id: string
    suite: { id: string; name: string; type: string }
  } | null
  skillVersion: {
    id: string
    commitMessage: string
    skillRepo: { displayName: string; slug: string }
  } | null
  _count: { toolEvents: number; artifacts: number }
}

interface FailureCluster {
  label: string
  count: number
  traceIds: string[]
  avgDurationMs: number | null
  avgTokens: number | null
}

type DerivedView = '' | 'high-token-outliers' | 'high-latency-outliers' | 'flaky-cases' | 'judge-disagrees' | 'passes-but-loses-review'

export default function TracesPage() {
  const [traces, setTraces] = useState<TraceItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 30

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Derived views & clusters
  const [activeView, setActiveView] = useState<DerivedView>('')
  const [clusters, setClusters] = useState<FailureCluster[]>([])
  const [showClusters, setShowClusters] = useState(false)

  const loadTraces = useCallback(async () => {
    setLoading(true)
    if (activeView) {
      const params = new URLSearchParams()
      params.set('view', activeView)
      params.set('limit', String(limit))
      params.set('offset', String(offset))
      const res = await fetch(`/api/traces/derived?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTraces(data.traces)
        setTotal(data.total)
      }
    } else {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('offset', String(offset))
      if (statusFilter) params.set('status', statusFilter)
      if (modelFilter) params.set('model', modelFilter)
      if (tagFilter) params.set('tag', tagFilter)
      const res = await fetch(`/api/traces?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTraces(data.traces)
        setTotal(data.total)
      }
    }
    setLoading(false)
  }, [offset, statusFilter, modelFilter, tagFilter, activeView])

  const loadClusters = useCallback(async () => {
    const res = await fetch('/api/traces/clusters')
    if (res.ok) setClusters(await res.json())
  }, [])

  useEffect(() => {
    loadTraces()
  }, [loadTraces])

  useEffect(() => {
    loadClusters()
  }, [loadClusters])

  const derivedViews: { key: DerivedView; label: string; desc: string }[] = [
    { key: 'high-token-outliers', label: 'High Token', desc: 'Token count > 2σ above mean' },
    { key: 'high-latency-outliers', label: 'High Latency', desc: 'Duration > 2σ above mean' },
    { key: 'flaky-cases', label: 'Flaky', desc: 'Inconsistent pass/fail across runs' },
    { key: 'judge-disagrees', label: 'Judge ≠ Human', desc: 'Judge disagrees with human label' },
    { key: 'passes-but-loses-review', label: 'Pass→Fail', desc: 'Passes assertions but fails review' },
  ]

  const clearFilters = () => {
    setStatusFilter(''); setModelFilter(''); setTagFilter(''); setActiveView(''); setOffset(0)
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-400" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-400" />
      case 'running': return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
      case 'pending': return <Clock className="h-4 w-4 text-yellow-400" />
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />
    }
  }

  const typeColors: Record<string, string> = {
    trigger: 'bg-blue-500/10 text-blue-400',
    output: 'bg-green-500/10 text-green-400',
    workflow: 'bg-purple-500/10 text-purple-400',
    regression: 'bg-red-500/10 text-red-400',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Trace Lab
          </h1>
          <p className="text-muted-foreground mt-1">
            Browse and analyze execution traces, failure clusters, and tool call timelines
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowClusters(!showClusters)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent"
          >
            <Layers className="h-4 w-4" /> Clusters {clusters.length > 0 && `(${clusters.length})`}
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent"
          >
            <Filter className="h-4 w-4" /> Filters
          </button>
        </div>
      </div>

      {/* Derived View Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setActiveView(''); setOffset(0) }}
          className={`px-3 py-1.5 rounded-md text-sm ${!activeView ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}
        >
          All Traces
        </button>
        {derivedViews.map(dv => (
          <button
            key={dv.key}
            onClick={() => { setActiveView(dv.key); setOffset(0) }}
            className={`px-3 py-1.5 rounded-md text-sm ${activeView === dv.key ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}
            title={dv.desc}
          >
            <BarChart3 className="h-3 w-3 inline mr-1" />
            {dv.label}
          </button>
        ))}
      </div>

      {/* Failure Clusters Panel */}
      {showClusters && clusters.length > 0 && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h3 className="font-medium flex items-center gap-2">
            <Layers className="h-4 w-4" /> Top Failure Clusters
          </h3>
          <div className="space-y-2">
            {clusters.slice(0, 10).map((cluster, i) => (
              <div key={i} className="flex items-center justify-between border border-border rounded-md p-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs truncate">{cluster.label}</p>
                  <div className="flex gap-3 mt-1 text-muted-foreground text-xs">
                    {cluster.avgDurationMs != null && <span>{(cluster.avgDurationMs / 1000).toFixed(1)}s avg</span>}
                    {cluster.avgTokens != null && <span>{Math.round(cluster.avgTokens)} avg tokens</span>}
                  </div>
                </div>
                <span className="ml-3 px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-xs font-medium">
                  {cluster.count} traces
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showClusters && clusters.length === 0 && (
        <div className="border border-dashed border-border rounded-lg p-6 text-center text-muted-foreground text-sm">
          No failure clusters found. Run evals to generate traces.
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="border border-border rounded-lg p-4 flex gap-4 items-end flex-wrap">
          <div>
            <label className="text-sm font-medium mb-1 block">Status</label>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setOffset(0) }}
              className="px-3 py-2 bg-background border border-border rounded-md text-sm"
            >
              <option value="">All</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Model</label>
            <input
              type="text"
              value={modelFilter}
              onChange={e => { setModelFilter(e.target.value); setOffset(0) }}
              placeholder="e.g. claude-sonnet"
              className="px-3 py-2 bg-background border border-border rounded-md text-sm w-40"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Tag</label>
            <input
              type="text"
              value={tagFilter}
              onChange={e => { setTagFilter(e.target.value); setOffset(0) }}
              placeholder="e.g. math"
              className="px-3 py-2 bg-background border border-border rounded-md text-sm w-32"
            />
          </div>
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="text-sm text-muted-foreground">
        {total} trace{total !== 1 ? 's' : ''} total
        {activeView && ` (view: ${activeView})`}
        {statusFilter && ` (status: ${statusFilter})`}
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : traces.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No traces yet</h3>
          <p className="text-muted-foreground mb-4">
            Run eval suites to generate execution traces. Traces capture tool calls,
            artifacts, timings, and outputs for every Claude Code execution.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {traces.map(trace => (
            <Link
              key={trace.id}
              href={`/traces/${trace.id}`}
              className="block border border-border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {statusIcon(trace.status)}
                  <span className="font-mono text-sm">{trace.id.slice(0, 12)}</span>
                  {trace.evalRun && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors[trace.evalRun.suite.type] || 'bg-gray-500/10 text-gray-400'}`}>
                      {trace.evalRun.suite.name}
                    </span>
                  )}
                  {trace.skillVersion && (
                    <span className="text-sm text-muted-foreground">
                      {trace.skillVersion.skillRepo.displayName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {trace.model && <span>{trace.model}</span>}
                  <span>{trace._count.toolEvents} tool calls</span>
                  <span>{trace._count.artifacts} artifacts</span>
                  {trace.totalDurationMs != null && <span>{(trace.totalDurationMs / 1000).toFixed(1)}s</span>}
                  {trace.totalTokens != null && <span>{trace.totalTokens} tokens</span>}
                  <span>{new Date(trace.createdAt).toLocaleString()}</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                {offset + 1}-{Math.min(offset + limit, total)} of {total}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
