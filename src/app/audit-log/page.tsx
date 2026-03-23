'use client'

import { useEffect, useState, useCallback } from 'react'
import { Shield, ChevronLeft, ChevronRight, Filter } from 'lucide-react'

interface AuditLogEntry {
  id: string
  action: string
  entityType: string
  entityId: string
  actor: string
  details: string
  createdAt: string
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const limit = 25

  const loadLogs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    params.set('offset', String(page * limit))
    if (actionFilter) params.set('action', actionFilter)
    if (entityTypeFilter) params.set('entityType', entityTypeFilter)
    if (actorFilter) params.set('actor', actorFilter)

    const res = await fetch(`/api/audit-log?${params}`)
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs)
      setTotal(data.total)
    }
    setLoading(false)
  }, [page, actionFilter, entityTypeFilter, actorFilter])

  useEffect(() => { loadLogs() }, [loadLogs])

  const totalPages = Math.ceil(total / limit)

  const actionColors: Record<string, string> = {
    created: 'bg-green-500/10 text-green-400',
    started: 'bg-blue-500/10 text-blue-400',
    completed: 'bg-blue-500/10 text-blue-400',
    failed: 'bg-red-500/10 text-red-400',
    promoted: 'bg-purple-500/10 text-purple-400',
    stopped: 'bg-amber-500/10 text-amber-400',
  }

  const getActionColor = (action: string) => {
    for (const [key, color] of Object.entries(actionColors)) {
      if (action.includes(key)) return color
    }
    return 'bg-gray-500/10 text-gray-400'
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" /> Audit Log
        </h1>
        <p className="text-muted-foreground mt-1">
          All significant actions are logged for traceability and security
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <input
          className="px-3 py-1.5 bg-background border border-border rounded-md text-sm w-48"
          placeholder="Filter by action..."
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(0) }}
        />
        <input
          className="px-3 py-1.5 bg-background border border-border rounded-md text-sm w-40"
          placeholder="Entity type..."
          value={entityTypeFilter}
          onChange={e => { setEntityTypeFilter(e.target.value); setPage(0) }}
        />
        <input
          className="px-3 py-1.5 bg-background border border-border rounded-md text-sm w-32"
          placeholder="Actor..."
          value={actorFilter}
          onChange={e => { setActorFilter(e.target.value); setPage(0) }}
        />
        <span className="text-sm text-muted-foreground ml-auto">{total} entries</span>
      </div>

      {/* Log table */}
      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No audit log entries</h3>
          <p className="text-muted-foreground">Actions will appear here as they occur.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-2 text-left font-medium">Timestamp</th>
                <th className="px-4 py-2 text-left font-medium">Action</th>
                <th className="px-4 py-2 text-left font-medium">Entity</th>
                <th className="px-4 py-2 text-left font-medium">Actor</th>
                <th className="px-4 py-2 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                let details: Record<string, unknown> = {}
                try { details = JSON.parse(log.details) } catch { /* empty */ }
                return (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {log.entityType && (
                        <span className="text-muted-foreground">
                          {log.entityType}
                          {log.entityId && <span className="font-mono ml-1 text-xs">#{log.entityId.slice(0, 8)}</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{log.actor}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground font-mono max-w-xs truncate">
                      {Object.keys(details).length > 0 ? JSON.stringify(details) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 border border-border rounded hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-1.5 border border-border rounded hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
