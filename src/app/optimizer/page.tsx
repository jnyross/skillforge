'use client'

import { useEffect, useState } from 'react'
import { Zap, Plus } from 'lucide-react'

interface OptimizerRun {
  id: string
  status: string
  maxIterations: number
  currentIteration: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  skillRepo: { displayName: string; slug: string }
  _count: { candidates: number; decisions: number }
}

export default function OptimizerPage() {
  const [runs, setRuns] = useState<OptimizerRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/optimizer-runs')
      .then(r => r.json())
      .then(data => { setRuns(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const statusColors: Record<string, string> = {
    queued: 'bg-gray-500/10 text-gray-400',
    running: 'bg-blue-500/10 text-blue-400 animate-pulse',
    completed: 'bg-green-500/10 text-green-400',
    stopped: 'bg-amber-500/10 text-amber-400',
    failed: 'bg-red-500/10 text-red-400',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6" />
            Optimizer
          </h1>
          <p className="text-muted-foreground mt-1">
            Karpathy-style evaluator-optimizer loop for skill improvement
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          New Run
        </button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No optimizer runs yet</h3>
          <p className="text-muted-foreground mb-4">
            Start an optimizer run to automatically propose, test, and rank
            improved skill versions using bounded hill climbing.
          </p>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Features: mutation operators, train/val/holdout discipline,</p>
            <p>keep/discard/crash logs, promotion gating, lineage graph</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <div
              key={run.id}
              className="border border-border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] || ''}`}>
                    {run.status}
                  </span>
                  <span className="font-medium">{run.skillRepo.displayName}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Iteration {run.currentIteration}/{run.maxIterations}</span>
                  <span>{run._count.candidates} candidates</span>
                </div>
              </div>
              <div className="mt-2">
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{ width: `${(run.currentIteration / run.maxIterations) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
