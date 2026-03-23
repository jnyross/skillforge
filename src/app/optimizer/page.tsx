'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Zap, Plus, X } from 'lucide-react'

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

interface SkillRepo {
  id: string
  displayName: string
  slug: string
}

interface SkillVersion {
  id: string
  commitMessage: string
  gitCommitSha: string
  createdAt: string
}

interface EvalSuite {
  id: string
  name: string
  type: string
}

export default function OptimizerPage() {
  const [runs, setRuns] = useState<OptimizerRun[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')

  // Create form state
  const [repos, setRepos] = useState<SkillRepo[]>([])
  const [versions, setVersions] = useState<SkillVersion[]>([])
  const [suites, setSuites] = useState<EvalSuite[]>([])
  const [selectedRepoId, setSelectedRepoId] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [selectedSuiteIds, setSelectedSuiteIds] = useState<string[]>([])
  const [maxIterations, setMaxIterations] = useState(10)
  const [maxBudgetUsd, setMaxBudgetUsd] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/optimizer-runs')
      .then(r => r.json())
      .then(data => { setRuns(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Load repos when create dialog opens
  useEffect(() => {
    if (!showCreate) return
    fetch('/api/skill-repos')
      .then(r => r.json())
      .then(data => setRepos(data))
      .catch(() => {})
  }, [showCreate])

  // Load versions when repo is selected
  useEffect(() => {
    if (!selectedRepoId) { setVersions([]); return }
    setSelectedSuiteIds([])
    fetch(`/api/skill-repos/${selectedRepoId}`)
      .then(r => r.json())
      .then(data => {
        setVersions(data.versions || [])
        if (data.versions?.length > 0) {
          setSelectedVersionId(data.versions[0].id)
        }
      })
      .catch(() => {})

    // Load suites for this repo
    fetch(`/api/eval-suites?skillRepoId=${selectedRepoId}`)
      .then(r => r.json())
      .then(data => setSuites(data))
      .catch(() => {})
  }, [selectedRepoId])

  const handleCreate = async () => {
    if (!selectedRepoId || !selectedVersionId) return
    setCreating(true)
    setError('')

    try {
      const res = await fetch('/api/optimizer-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillRepoId: selectedRepoId,
          baselineVersionId: selectedVersionId,
          suiteIds: selectedSuiteIds,
          maxIterations,
          maxBudgetUsd: maxBudgetUsd ? parseFloat(maxBudgetUsd) : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to create optimizer run')
        return
      }

      // Refresh list
      const listRes = await fetch('/api/optimizer-runs')
      const listData = await listRes.json()
      setRuns(listData)
      setShowCreate(false)
      resetForm()
    } catch {
      setError('Failed to create optimizer run')
    } finally {
      setCreating(false)
    }
  }

  const resetForm = () => {
    setSelectedRepoId('')
    setSelectedVersionId('')
    setSelectedSuiteIds([])
    setMaxIterations(10)
    setMaxBudgetUsd('')
    setError('')
  }

  const toggleSuite = (suiteId: string) => {
    setSelectedSuiteIds(prev =>
      prev.includes(suiteId)
        ? prev.filter(id => id !== suiteId)
        : [...prev, suiteId]
    )
  }

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
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Run
        </button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="border border-border rounded-lg p-6 space-y-4 bg-card">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">New Optimizer Run</h3>
            <button onClick={() => { setShowCreate(false); resetForm() }} className="p-1 hover:bg-accent rounded">
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Skill Repo */}
          <div>
            <label className="block text-sm font-medium mb-1">Skill Repository *</label>
            <select
              value={selectedRepoId}
              onChange={e => setSelectedRepoId(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
            >
              <option value="">Select a repository...</option>
              {repos.map(repo => (
                <option key={repo.id} value={repo.id}>{repo.displayName}</option>
              ))}
            </select>
          </div>

          {/* Baseline Version */}
          <div>
            <label className="block text-sm font-medium mb-1">Baseline Version *</label>
            <select
              value={selectedVersionId}
              onChange={e => setSelectedVersionId(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
              disabled={!selectedRepoId}
            >
              <option value="">Select a version...</option>
              {versions.map(v => (
                <option key={v.id} value={v.id}>
                  {v.gitCommitSha.slice(0, 7)} — {v.commitMessage}
                </option>
              ))}
            </select>
          </div>

          {/* Eval Suites */}
          {suites.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Eval Suites</label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {suites.map(suite => (
                  <label key={suite.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSuiteIds.includes(suite.id)}
                      onChange={() => toggleSuite(suite.id)}
                      className="rounded"
                    />
                    <span>{suite.name}</span>
                    <span className="text-xs text-muted-foreground">({suite.type})</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Max Iterations */}
          <div>
            <label className="block text-sm font-medium mb-1">Max Iterations</label>
            <input
              type="number"
              value={maxIterations}
              onChange={e => setMaxIterations(parseInt(e.target.value) || 10)}
              min={1}
              max={100}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
            />
          </div>

          {/* Budget */}
          <div>
            <label className="block text-sm font-medium mb-1">Max Budget (USD, optional)</label>
            <input
              type="number"
              value={maxBudgetUsd}
              onChange={e => setMaxBudgetUsd(e.target.value)}
              step="0.01"
              min="0"
              placeholder="No budget limit"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={!selectedRepoId || !selectedVersionId || creating}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Optimizer Run'}
          </button>
        </div>
      )}

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
            <Link
              key={run.id}
              href={`/optimizer/${run.id}`}
              className="block border border-border rounded-lg p-4 hover:bg-accent transition-colors"
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
                  <span>{run._count.decisions} decisions</span>
                </div>
              </div>
              <div className="mt-2">
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{ width: `${run.maxIterations > 0 ? (run.currentIteration / run.maxIterations) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Created {new Date(run.createdAt).toLocaleDateString()}
                {run.completedAt && ` — Completed ${new Date(run.completedAt).toLocaleDateString()}`}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
