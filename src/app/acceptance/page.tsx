'use client'

import { useEffect, useState } from 'react'
import { Shield, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'

interface Feature {
  name: string
  phase: number
  ready: boolean
  metrics: Record<string, number>
}

interface AcceptanceData {
  summary: Record<string, number>
  features: Feature[]
  latestRuns: Array<{
    id: string
    status: string
    passRate: number | null
    createdAt: string
    executorType: string
  }>
  breakdowns: {
    evalRuns: Array<{ status: string; count: number }>
    wizardDrafts: Array<{ status: string; count: number }>
    optimizerRuns: Array<{ status: string; count: number }>
  }
}

export default function AcceptancePage() {
  const [data, setData] = useState<AcceptanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/acceptance')
      const json = await res.json()
      setData(json)
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const statusColors: Record<string, string> = {
    completed: 'bg-green-500/10 text-green-400',
    running: 'bg-blue-500/10 text-blue-400',
    queued: 'bg-gray-500/10 text-gray-400',
    failed: 'bg-red-500/10 text-red-400',
    stopped: 'bg-amber-500/10 text-amber-400',
    saved: 'bg-green-500/10 text-green-400',
    intake: 'bg-blue-500/10 text-blue-400',
    review: 'bg-amber-500/10 text-amber-400',
    generating: 'bg-blue-500/10 text-blue-400',
    abandoned: 'bg-gray-500/10 text-gray-400',
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading acceptance dashboard...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-red-400">Failed to load acceptance data.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Acceptance Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Production readiness overview for all SkillForge subsystems
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[
          { label: 'Skill Repos', value: data.summary.totalRepos },
          { label: 'Versions', value: data.summary.totalVersions },
          { label: 'Eval Suites', value: data.summary.totalEvalSuites },
          { label: 'Eval Runs', value: data.summary.totalEvalRuns },
          { label: 'Traces', value: data.summary.totalTraces },
          { label: 'Reviews', value: data.summary.totalReviewSessions },
          { label: 'Judges', value: data.summary.totalJudges },
          { label: 'Optimizer Runs', value: data.summary.totalOptimizerRuns },
          { label: 'Wizard Drafts', value: data.summary.totalWizardDrafts },
        ].map(card => (
          <div key={card.label} className="border border-border rounded-lg p-4 bg-card">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-2xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Feature readiness */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Feature Readiness</h2>
        <div className="space-y-2">
          {data.features.map(feature => (
            <div key={feature.name} className="flex items-center justify-between border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                {feature.ready ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-400" />
                )}
                <div>
                  <p className="font-medium">{feature.name}</p>
                  <p className="text-xs text-muted-foreground">Phase {feature.phase}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {Object.entries(feature.metrics).map(([key, val]) => (
                  <span key={key}>{val} {key}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Eval runs breakdown */}
        <div>
          <h3 className="text-sm font-medium mb-2">Eval Runs by Status</h3>
          <div className="border border-border rounded-lg p-4 space-y-2">
            {data.breakdowns.evalRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No eval runs yet</p>
            ) : (
              data.breakdowns.evalRuns.map(r => (
                <div key={r.status} className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[r.status] || ''}`}>
                    {r.status}
                  </span>
                  <span className="text-sm font-medium">{r.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Wizard drafts breakdown */}
        <div>
          <h3 className="text-sm font-medium mb-2">Wizard Drafts by Status</h3>
          <div className="border border-border rounded-lg p-4 space-y-2">
            {data.breakdowns.wizardDrafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No wizard drafts yet</p>
            ) : (
              data.breakdowns.wizardDrafts.map(d => (
                <div key={d.status} className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[d.status] || ''}`}>
                    {d.status}
                  </span>
                  <span className="text-sm font-medium">{d.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Optimizer runs breakdown */}
        <div>
          <h3 className="text-sm font-medium mb-2">Optimizer Runs by Status</h3>
          <div className="border border-border rounded-lg p-4 space-y-2">
            {data.breakdowns.optimizerRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No optimizer runs yet</p>
            ) : (
              data.breakdowns.optimizerRuns.map(o => (
                <div key={o.status} className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[o.status] || ''}`}>
                    {o.status}
                  </span>
                  <span className="text-sm font-medium">{o.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Latest eval runs */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Latest Eval Runs</h2>
        {data.latestRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No eval runs yet. Create an eval suite and start a run to see results here.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-4 py-2 text-left font-medium">Run ID</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Pass Rate</th>
                  <th className="px-4 py-2 text-left font-medium">Executor</th>
                  <th className="px-4 py-2 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.latestRuns.map(run => (
                  <tr key={run.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{run.id.slice(0, 8)}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] || ''}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {run.passRate != null ? `${(run.passRate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{run.executorType}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
