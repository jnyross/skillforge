'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FlaskConical, Plus, ChevronRight } from 'lucide-react'

interface EvalSuite {
  id: string
  name: string
  type: string
  frozen: boolean
  description: string
  createdAt: string
  skillRepo: { displayName: string; slug: string }
  _count: { cases: number; evalRuns: number }
}

interface SkillRepo {
  id: string
  displayName: string
  slug: string
}

export default function EvalsPage() {
  const [suites, setSuites] = useState<EvalSuite[]>([])
  const [repos, setRepos] = useState<SkillRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', type: 'output', skillRepoId: '', description: '' })

  const loadSuites = () => {
    fetch('/api/eval-suites')
      .then(r => r.json())
      .then(data => { setSuites(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadSuites()
    fetch('/api/skill-repos')
      .then(r => r.json())
      .then(setRepos)
      .catch(() => {})
  }, [])

  const createSuite = async () => {
    if (!form.name || !form.skillRepoId) return
    setCreating(true)
    setError('')
    const res = await fetch('/api/eval-suites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ name: '', type: 'output', skillRepoId: '', description: '' })
      setShowCreate(false)
      loadSuites()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to create suite')
    }
    setCreating(false)
  }

  const typeColors: Record<string, string> = {
    trigger: 'bg-blue-500/10 text-blue-400',
    output: 'bg-green-500/10 text-green-400',
    workflow: 'bg-purple-500/10 text-purple-400',
    regression: 'bg-red-500/10 text-red-400',
    blind: 'bg-amber-500/10 text-amber-400',
    calibration: 'bg-cyan-500/10 text-cyan-400',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6" />
            Eval Suites
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage evaluation suites, cases, and runs
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Suite
        </button>
      </div>

      {/* Create Suite Form */}
      {showCreate && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <h3 className="font-medium">Create Eval Suite</h3>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Trigger Accuracy Suite"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Skill Repo</label>
              <select
                value={form.skillRepoId}
                onChange={e => setForm(f => ({ ...f, skillRepoId: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
              >
                <option value="">Select repo...</option>
                {repos.map(r => (
                  <option key={r.id} value={r.id}>{r.displayName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
              >
                <option value="trigger">Trigger</option>
                <option value="output">Output</option>
                <option value="workflow">Workflow</option>
                <option value="regression">Regression</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description..."
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createSuite}
              disabled={!form.name || !form.skillRepoId || creating}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Suite'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setError('') }}
              className="px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : suites.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No eval suites yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first eval suite to start testing skill versions
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suites.map(suite => (
            <Link
              key={suite.id}
              href={`/evals/${suite.id}`}
              className="block border border-border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors[suite.type] || 'bg-gray-500/10 text-gray-400'}`}>
                    {suite.type}
                  </span>
                  <span className="font-medium">{suite.name}</span>
                  {suite.frozen && (
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400">frozen</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{suite._count.cases} cases</span>
                  <span>{suite._count.evalRuns} runs</span>
                  <span>{suite.skillRepo.displayName}</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
              {suite.description && (
                <p className="text-sm text-muted-foreground mt-2">{suite.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
