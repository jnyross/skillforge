'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface ReviewSession {
  id: string
  name: string
  type: string
  status: string
  reviewer: string
  totalPairs: number
  completedPairs: number
  createdAt: string
  skillRepo: { displayName: string; slug: string }
  _count: { comparisons: number; labels: number }
}

interface SkillRepo {
  id: string
  displayName: string
  slug: string
}

export default function ReviewsPage() {
  const [sessions, setSessions] = useState<ReviewSession[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [repos, setRepos] = useState<SkillRepo[]>([])
  const [form, setForm] = useState({ name: '', type: 'pass-fail', skillRepoId: '', reviewer: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadSessions = useCallback(async () => {
    const res = await fetch('/api/review-sessions')
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
    const res = await fetch('/api/review-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        reviewer: form.reviewer || 'user',
      }),
    })
    if (res.ok) {
      setForm({ name: '', type: 'pass-fail', skillRepoId: '', reviewer: '' })
      setShowCreate(false)
      loadSessions()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to create session')
    }
    setCreating(false)
  }

  const typeColors: Record<string, string> = {
    'blind-ab': 'bg-purple-500/10 text-purple-400',
    'pass-fail': 'bg-green-500/10 text-green-400',
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-400',
    completed: 'bg-blue-500/10 text-blue-400',
    abandoned: 'bg-gray-500/10 text-gray-400',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Review Arena
          </h1>
          <p className="text-muted-foreground mt-1">
            Blind A/B comparisons and pass/fail reviews for skill outputs
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
          <h3 className="font-medium">Create Review Session</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Name *</label>
              <input
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                placeholder="e.g. Sprint 5 Output Review"
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
              <label className="text-sm text-muted-foreground">Type</label>
              <select
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
              >
                <option value="pass-fail">Pass/Fail Review</option>
                <option value="blind-ab">Blind A/B Comparison</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Reviewer</label>
              <input
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                placeholder="user"
                value={form.reviewer}
                onChange={e => setForm({ ...form, reviewer: e.target.value })}
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
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No review sessions yet</h3>
          <p className="text-muted-foreground mb-4">
            Create a review session to blindly compare skill outputs.
            Version identity is hidden until after your selection.
          </p>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Features: blind A/B review, pass/fail labels, critiques,</p>
            <p>keyboard shortcuts, progress tracking, export</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <Link
              key={session.id}
              href={`/reviews/${session.id}`}
              className="block border border-border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors[session.type] || 'bg-gray-500/10 text-gray-400'}`}>
                    {session.type}
                  </span>
                  <span className="font-medium">{session.name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${statusColors[session.status] || ''}`}>
                    {session.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{session.completedPairs}/{session.totalPairs} reviewed</span>
                  <span>{session.skillRepo.displayName}</span>
                  <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
