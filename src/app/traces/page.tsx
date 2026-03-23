'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Activity, CheckCircle, XCircle, Clock, AlertCircle,
  Loader2, Filter, ChevronRight
} from 'lucide-react'

interface TraceItem {
  id: string
  sessionId: string
  model: string
  status: string
  totalDurationMs: number | null
  totalCostUsd: number | null
  totalTokens: number | null
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

export default function TracesPage() {
  const [traces, setTraces] = useState<TraceItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 30

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const loadTraces = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    if (statusFilter) params.set('status', statusFilter)

    const res = await fetch(`/api/traces?${params}`)
    if (res.ok) {
      const data = await res.json()
      setTraces(data.traces)
      setTotal(data.total)
    }
    setLoading(false)
  }, [offset, statusFilter])

  useEffect(() => {
    loadTraces()
  }, [loadTraces])

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
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent"
        >
          <Filter className="h-4 w-4" /> Filters
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="border border-border rounded-lg p-4 flex gap-4 items-end">
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
          <button
            onClick={() => { setStatusFilter(''); setOffset(0) }}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="text-sm text-muted-foreground">
        {total} trace{total !== 1 ? 's' : ''} total
        {statusFilter && ` (filtered: ${statusFilter})`}
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
