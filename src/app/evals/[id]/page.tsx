'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FlaskConical, Plus, Play, ChevronLeft, Lock, Unlock,
  CheckCircle, XCircle, Clock, AlertCircle, Loader2
} from 'lucide-react'

interface EvalSuite {
  id: string
  skillRepoId: string
  name: string
  type: string
  frozen: boolean
  splitPolicy: string
  version: number
  description: string
  createdAt: string
  skillRepo: { displayName: string; slug: string }
}

interface EvalCase {
  id: string
  key: string
  name: string
  prompt: string
  shouldTrigger: boolean | null
  expectedOutcome: string
  split: string
  tags: string
  source: string
}

interface EvalRun {
  id: string
  status: string
  executorType: string
  model: string
  metricsJson: string
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  error: string | null
  skillVersion: { id: string; commitMessage: string; gitCommitSha: string }
  _count: { caseRuns: number; traces: number }
}

interface SkillVersion {
  id: string
  commitMessage: string
  gitCommitSha: string
  branchName: string
}

export default function EvalSuiteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const suiteId = params.id as string

  const [suite, setSuite] = useState<EvalSuite | null>(null)
  const [cases, setCases] = useState<EvalCase[]>([])
  const [runs, setRuns] = useState<EvalRun[]>([])
  const [versions, setVersions] = useState<SkillVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'cases' | 'runs'>('cases')

  // Add case form
  const [showAddCase, setShowAddCase] = useState(false)
  const [newCase, setNewCase] = useState({ key: '', name: '', prompt: '', shouldTrigger: 'true', split: 'train', tags: '', expectedOutcome: '' })

  // Run form
  const [showRunForm, setShowRunForm] = useState(false)
  const [runForm, setRunForm] = useState({ versionId: '', executorType: 'claude-cli', model: 'claude-opus-4-6', splitFilter: 'all' })

  const loadSuite = useCallback(async () => {
    const res = await fetch(`/api/eval-suites/${suiteId}`)
    if (!res.ok) { router.push('/evals'); return }
    setSuite(await res.json())
  }, [suiteId, router])

  const loadCases = useCallback(async () => {
    const res = await fetch(`/api/eval-suites/${suiteId}/cases`)
    if (res.ok) setCases(await res.json())
  }, [suiteId])

  const loadRuns = useCallback(async () => {
    if (!suite) return
    const res = await fetch(`/api/eval-runs?suiteId=${suiteId}`)
    if (res.ok) setRuns(await res.json())
  }, [suiteId, suite])

  useEffect(() => {
    Promise.all([loadSuite(), loadCases()]).then(() => setLoading(false))
  }, [loadSuite, loadCases])

  useEffect(() => {
    if (suite) {
      loadRuns()
      fetch(`/api/skill-repos/${suite.skillRepoId}/versions`)
        .then(r => r.json())
        .then(setVersions)
        .catch(() => {})
    }
  }, [suite, loadRuns])

  const addCase = async () => {
    const res = await fetch(`/api/eval-suites/${suiteId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newCase,
        shouldTrigger: suite?.type === 'trigger' ? newCase.shouldTrigger === 'true' : undefined,
      }),
    })
    if (res.ok) {
      setNewCase({ key: '', name: '', prompt: '', shouldTrigger: 'true', split: 'train', tags: '', expectedOutcome: '' })
      setShowAddCase(false)
      loadCases()
    }
  }

  const startRun = async () => {
    if (!runForm.versionId || !suite) return
    const createRes = await fetch('/api/eval-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skillRepoId: suite.skillRepoId,
        skillVersionId: runForm.versionId,
        suiteId: suite.id,
        executorType: runForm.executorType,
        model: runForm.model,
        splitFilter: runForm.splitFilter,
      }),
    })
    if (!createRes.ok) return
    const run = await createRes.json()

    await fetch(`/api/eval-runs/${run.id}/start`, { method: 'POST' })
    setShowRunForm(false)
    loadRuns()
  }

  const toggleFrozen = async () => {
    if (!suite) return
    await fetch(`/api/eval-suites/${suiteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frozen: !suite.frozen }),
    })
    loadSuite()
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-400" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-400" />
      case 'running': return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
      case 'queued': return <Clock className="h-4 w-4 text-yellow-400" />
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />
    }
  }

  const typeColors: Record<string, string> = {
    trigger: 'bg-blue-500/10 text-blue-400',
    output: 'bg-green-500/10 text-green-400',
    workflow: 'bg-purple-500/10 text-purple-400',
    regression: 'bg-red-500/10 text-red-400',
  }

  if (loading || !suite) {
    return <div className="p-6 text-muted-foreground">Loading...</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/evals" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ChevronLeft className="h-4 w-4" /> Back to Eval Suites
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-6 w-6" />
            <h1 className="text-2xl font-bold">{suite.name}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors[suite.type] || 'bg-gray-500/10 text-gray-400'}`}>
              {suite.type}
            </span>
            <button onClick={toggleFrozen} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-border hover:bg-accent" title={suite.frozen ? 'Unfreeze suite' : 'Freeze suite'}>
              {suite.frozen ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              {suite.frozen ? 'Frozen' : 'Mutable'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowRunForm(!showRunForm)}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
            >
              <Play className="h-4 w-4" /> Run Eval
            </button>
          </div>
        </div>
        {suite.description && <p className="text-muted-foreground mt-2">{suite.description}</p>}
        <div className="text-sm text-muted-foreground mt-1">
          Repo: {suite.skillRepo.displayName} &middot; Split policy: {suite.splitPolicy} &middot; v{suite.version}
        </div>
      </div>

      {/* Run form */}
      {showRunForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <h3 className="font-medium">Start Eval Run</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Skill Version</label>
              <select
                value={runForm.versionId}
                onChange={e => setRunForm(f => ({ ...f, versionId: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
              >
                <option value="">Select version...</option>
                {versions.map(v => (
                  <option key={v.id} value={v.id}>{v.commitMessage} ({v.gitCommitSha.slice(0, 7)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Executor</label>
              <select
                value={runForm.executorType}
                onChange={e => setRunForm(f => ({ ...f, executorType: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
              >
                <option value="claude-cli">Claude CLI</option>
                <option value="mock">Mock (Testing)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Model</label>
              <select
                value={runForm.model}
                onChange={e => setRunForm(f => ({ ...f, model: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
              >
                <option value="claude-opus-4-6">Claude Opus 4.6</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Split Filter (Holdout Protection)</label>
            <select
              value={runForm.splitFilter}
              onChange={e => setRunForm(f => ({ ...f, splitFilter: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
            >
              <option value="all">All splits</option>
              <option value="train">Train only</option>
              <option value="validation">Validation only</option>
              <option value="train+validation">Train + Validation (exclude holdout)</option>
              <option value="holdout">Holdout only</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">Use &quot;Train + Validation&quot; for optimizer runs to protect holdout data</p>
          </div>
          <div className="flex gap-2">
            <button onClick={startRun} disabled={!runForm.versionId} className="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50">
              Start Run
            </button>
            <button onClick={() => setShowRunForm(false)} className="px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border">
        <button
          onClick={() => setTab('cases')}
          className={`pb-2 text-sm font-medium border-b-2 ${tab === 'cases' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Cases ({cases.length})
        </button>
        <button
          onClick={() => setTab('runs')}
          className={`pb-2 text-sm font-medium border-b-2 ${tab === 'runs' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Runs ({runs.length})
        </button>
      </div>

      {/* Cases tab */}
      {tab === 'cases' && (
        <div className="space-y-3">
          {!suite.frozen && (
            <button
              onClick={() => setShowAddCase(!showAddCase)}
              className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Plus className="h-4 w-4" /> Add Case
            </button>
          )}

          {showAddCase && !suite.frozen && (
            <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Key</label>
                  <input type="text" value={newCase.key} onChange={e => setNewCase(c => ({ ...c, key: e.target.value }))}
                    placeholder="unique-case-key" className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Name</label>
                  <input type="text" value={newCase.name} onChange={e => setNewCase(c => ({ ...c, name: e.target.value }))}
                    placeholder="Case name" className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Prompt</label>
                <textarea value={newCase.prompt} onChange={e => setNewCase(c => ({ ...c, prompt: e.target.value }))}
                  rows={3} placeholder="The prompt to send to Claude..." className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                {suite.type === 'trigger' && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Should Trigger</label>
                    <select value={newCase.shouldTrigger} onChange={e => setNewCase(c => ({ ...c, shouldTrigger: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm">
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium mb-1 block">Split</label>
                  <select value={newCase.split} onChange={e => setNewCase(c => ({ ...c, split: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm">
                    <option value="train">Train</option>
                    <option value="validation">Validation</option>
                    <option value="holdout">Holdout</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Tags</label>
                  <input type="text" value={newCase.tags} onChange={e => setNewCase(c => ({ ...c, tags: e.target.value }))}
                    placeholder="tag1, tag2" className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm" />
                </div>
              </div>
              {suite.type !== 'trigger' && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Expected Outcome</label>
                  <textarea value={newCase.expectedOutcome} onChange={e => setNewCase(c => ({ ...c, expectedOutcome: e.target.value }))}
                    rows={2} placeholder="What the output should contain..." className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm" />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={addCase} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">Add</button>
                <button onClick={() => setShowAddCase(false)} className="px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent">Cancel</button>
              </div>
            </div>
          )}

          {cases.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
              No eval cases yet. Add cases to test skill versions.
            </div>
          ) : (
            cases.map(c => (
              <div key={c.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{c.key}</span>
                    {c.shouldTrigger !== null && (
                      <span className={`px-2 py-0.5 rounded text-xs ${c.shouldTrigger ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {c.shouldTrigger ? 'should trigger' : 'should NOT trigger'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 rounded bg-secondary">{c.split}</span>
                    {c.source && c.source !== 'manual' && (
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400">{c.source}</span>
                    )}
                    {c.tags && c.tags.split(',').map(t => (
                      <span key={t.trim()} className="px-2 py-0.5 rounded bg-secondary">{t.trim()}</span>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{c.prompt}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Runs tab */}
      {tab === 'runs' && (
        <div className="space-y-3">
          {runs.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
              No eval runs yet. Start a run to evaluate a skill version.
            </div>
          ) : (
            runs.map(run => (
              <Link
                key={run.id}
                href={`/evals/runs/${run.id}`}
                className="block border border-border rounded-lg p-4 hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {statusIcon(run.status)}
                    <span className="font-medium capitalize">{run.status}</span>
                    <span className="text-sm text-muted-foreground">
                      {run.skillVersion.commitMessage} ({run.skillVersion.gitCommitSha.slice(0, 7)})
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{run.executorType}</span>
                    <span>{run._count.caseRuns} case runs</span>
                    <span>{run._count.traces} traces</span>
                    <span>{new Date(run.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                {run.status === 'completed' && (() => {
                  try {
                    const metrics = JSON.parse(run.metricsJson)
                    return (
                      <div className="flex gap-4 mt-2 text-sm">
                        <span className="text-green-400">Pass rate: {(metrics.passRate * 100).toFixed(1)}%</span>
                        <span>Total: {metrics.totalCases}</span>
                        <span className="text-green-400">Passed: {metrics.passCount}</span>
                        <span className="text-red-400">Failed: {metrics.failCount}</span>
                      </div>
                    )
                  } catch { return null }
                })()}
                {run.error && (
                  <p className="text-sm text-red-400 mt-2">{run.error}</p>
                )}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
