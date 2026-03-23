'use client'

import { useEffect, useState, useCallback } from 'react'
import { SearchSlash, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface ErrorAnalysisSession {
  id: string
  name: string
  description: string
  status: string
  samplingStrategy: string
  targetTraceCount: number
  createdAt: string
  skillRepo: { id: string; displayName: string }
  _count: { traces: number; categories: number }
}

interface SkillRepo {
  id: string
  displayName: string
  slug: string
}

export default function ErrorAnalysisPage() {
  const [sessions, setSessions] = useState<ErrorAnalysisSession[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [repos, setRepos] = useState<SkillRepo[]>([])
  const [form, setForm] = useState({
    name: '',
    skillRepoId: '',
    description: '',
    samplingStrategy: 'random',
    targetTraceCount: 100,
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadSessions = useCallback(async () => {
    const res = await fetch('/api/error-analysis')
    if (res.ok) {
      setSessions(await res.json())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSessions()
    fetch('/api/skill-repos').then(r => r.json()).then(setRepos).catch(() => {})
  }, [loadSessions])

  const createSession = async () => {
    if (!form.name || !form.skillRepoId) return
    setCreating(true)
    setError('')
    const res = await fetch('/api/error-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ name: '', skillRepoId: '', description: '', samplingStrategy: 'random', targetTraceCount: 100 })
      setShowCreate(false)
      loadSessions()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to create session')
    }
    setCreating(false)
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-400',
    completed: 'bg-blue-500/10 text-blue-400',
    saturated: 'bg-purple-500/10 text-purple-400',
  }

  const strategyLabels: Record<string, string> = {
    random: 'Random',
    'failure-driven': 'Failure-Driven',
    outlier: 'Outlier',
    stratified: 'Stratified',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SearchSlash className="h-6 w-6" />
            Error Analysis
          </h1>
          <p className="text-muted-foreground mt-1">
            Systematic trace review with open coding, failure taxonomy, and saturation tracking
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Session
        </button>
      </div>

      {showCreate && (
        <div className="border border-border rounded-lg p-4 space-y-4">
          <h3 className="font-medium">Create Error Analysis Session</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Name *</label>
              <input
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                placeholder="e.g. Sprint 5 Failure Review"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Skill Repo *</label>
              <select
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                value={form.skillRepoId}
                onChange={e => setForm({ ...form, skillRepoId: e.target.value })}
              >
                <option value="">Select repo...</option>
                {repos.map(r => (
                  <option key={r.id} value={r.id}>{r.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Sampling Strategy</label>
              <select
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                value={form.samplingStrategy}
                onChange={e => setForm({ ...form, samplingStrategy: e.target.value })}
              >
                <option value="random">Random</option>
                <option value="failure-driven">Failure-Driven</option>
                <option value="outlier">Outlier</option>
                <option value="stratified">Stratified</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Target Trace Count</label>
              <input
                type="number"
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                value={form.targetTraceCount}
                onChange={e => setForm({ ...form, targetTraceCount: parseInt(e.target.value) || 100 })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-muted-foreground">Description</label>
              <textarea
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                rows={2}
                placeholder="What are you investigating?"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={createSession}
              disabled={creating || !form.name || !form.skillRepoId}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Session'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setError('') }}
              className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <SearchSlash className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No error analysis sessions yet</h3>
          <p className="text-muted-foreground mb-4">
            Create a session to systematically review traces and discover failure categories.
          </p>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Workflow: Sample traces → Open coding (free-text notes) →</p>
            <p>Axial coding (categorize failures) → Track saturation →</p>
            <p>Generate eval cases from discovered categories</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <Link
              key={session.id}
              href={`/error-analysis/${session.id}`}
              className="block border border-border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[session.status] || 'bg-gray-500/10 text-gray-400'}`}>
                    {session.status}
                  </span>
                  <span className="font-medium">{session.name}</span>
                  <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                    {strategyLabels[session.samplingStrategy] || session.samplingStrategy}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{session._count.traces} traces</span>
                  <span>{session._count.categories} categories</span>
                  <span>{session.skillRepo.displayName}</span>
                  <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
              {session.description && (
                <p className="text-sm text-muted-foreground mt-2 ml-1">{session.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
