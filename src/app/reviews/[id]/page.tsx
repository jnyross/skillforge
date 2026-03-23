'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Play, Download, CheckCircle, XCircle, Clock, Users } from 'lucide-react'

interface Critique {
  id: string
  content: string
  category: string
  severity: string
}

interface ReviewLabel {
  id: string
  evalCaseRunId: string
  label: string
  confidence: number
  createdAt: string
  critiques: Critique[]
}

interface PreferenceVote {
  id: string
  selectedWinner: string
  confidence: number
  durationMs: number | null
  createdAt: string
}

interface Comparison {
  id: string
  evalCaseRunIdA: string
  evalCaseRunIdB: string
  versionIdA: string
  versionIdB: string
  order: number
  votes: PreferenceVote[]
}

interface ReviewSessionDetail {
  id: string
  name: string
  type: string
  status: string
  reviewer: string
  totalPairs: number
  completedPairs: number
  createdAt: string
  completedAt: string | null
  skillRepo: { displayName: string }
  comparisons: Comparison[]
  labels: ReviewLabel[]
}

export default function ReviewSessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [session, setSession] = useState<ReviewSessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'labels' | 'comparisons'>('overview')

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/review-sessions/${id}`)
    if (res.ok) {
      setSession(await res.json())
    }
    setLoading(false)
  }, [id])

  useEffect(() => { loadSession() }, [loadSession])

  const updateStatus = async (status: string) => {
    await fetch(`/api/review-sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadSession()
  }

  const exportSession = async () => {
    const res = await fetch(`/api/review-sessions/${id}/export`)
    if (res.ok) {
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `review-${session?.name || id}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>
  if (!session) return <div className="p-6 text-red-400">Session not found</div>

  const passCount = session.labels.filter(l => l.label === 'pass').length
  const failCount = session.labels.filter(l => l.label === 'fail').length
  const votedComparisons = session.comparisons.filter(c => c.votes.length > 0).length

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/reviews" className="hover:text-foreground">Review Arena</Link>
        <span>/</span>
        <span className="text-foreground">{session.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {session.name}
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              session.type === 'blind-ab' ? 'bg-purple-500/10 text-purple-400' : 'bg-green-500/10 text-green-400'
            }`}>
              {session.type}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs ${
              session.status === 'active' ? 'bg-green-500/10 text-green-400' :
              session.status === 'completed' ? 'bg-blue-500/10 text-blue-400' :
              'bg-gray-500/10 text-gray-400'
            }`}>
              {session.status}
            </span>
          </h1>
          <p className="text-muted-foreground mt-1">
            {session.skillRepo.displayName} &middot; Reviewer: {session.reviewer} &middot; Created {new Date(session.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          {session.status === 'active' && (
            <>
              <Link
                href={`/reviews/${id}/review`}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
              >
                <Play className="h-4 w-4" />
                Start Reviewing
              </Link>
              <button
                onClick={() => updateStatus('completed')}
                className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent"
              >
                Mark Complete
              </button>
              <button
                onClick={() => updateStatus('abandoned')}
                className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent text-red-400"
              >
                Abandon
              </button>
            </>
          )}
          <button
            onClick={exportSession}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-md text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Progress</p>
          <p className="text-2xl font-bold mt-1">{session.completedPairs}/{session.totalPairs}</p>
          {session.totalPairs > 0 && (
            <div className="w-full bg-secondary rounded-full h-2 mt-2">
              <div
                className="bg-primary rounded-full h-2"
                style={{ width: `${Math.round((session.completedPairs / session.totalPairs) * 100)}%` }}
              />
            </div>
          )}
        </div>
        <div className="border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Pass / Fail</p>
          <p className="text-2xl font-bold mt-1">
            <span className="text-green-400">{passCount}</span>
            {' / '}
            <span className="text-red-400">{failCount}</span>
          </p>
        </div>
        <div className="border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Comparisons Voted</p>
          <p className="text-2xl font-bold mt-1">{votedComparisons}/{session.comparisons.length}</p>
        </div>
        <div className="border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Critiques</p>
          <p className="text-2xl font-bold mt-1">{session.labels.reduce((s, l) => s + l.critiques.length, 0)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6">
          {(['overview', 'labels', 'comparisons'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium border-b-2 ${
                tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'labels' && ` (${session.labels.length})`}
              {t === 'comparisons' && ` (${session.comparisons.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="border border-border rounded-lg p-4">
            <h3 className="font-medium mb-2">Session Info</h3>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Type</dt>
              <dd>{session.type === 'blind-ab' ? 'Blind A/B Comparison' : 'Pass/Fail Review'}</dd>
              <dt className="text-muted-foreground">Reviewer</dt>
              <dd>{session.reviewer}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{session.status}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{new Date(session.createdAt).toLocaleString()}</dd>
              {session.completedAt && (
                <>
                  <dt className="text-muted-foreground">Completed</dt>
                  <dd>{new Date(session.completedAt).toLocaleString()}</dd>
                </>
              )}
            </dl>
          </div>
          {session.type === 'pass-fail' && session.labels.length > 0 && (
            <div className="border border-border rounded-lg p-4">
              <h3 className="font-medium mb-2">Pass/Fail Distribution</h3>
              <div className="flex gap-2 h-8">
                {passCount > 0 && (
                  <div
                    className="bg-green-500/20 border border-green-500/30 rounded flex items-center justify-center text-xs text-green-400 font-medium"
                    style={{ width: `${(passCount / (passCount + failCount)) * 100}%` }}
                  >
                    Pass: {passCount}
                  </div>
                )}
                {failCount > 0 && (
                  <div
                    className="bg-red-500/20 border border-red-500/30 rounded flex items-center justify-center text-xs text-red-400 font-medium"
                    style={{ width: `${(failCount / (passCount + failCount)) * 100}%` }}
                  >
                    Fail: {failCount}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'labels' && (
        <div className="space-y-3">
          {session.labels.length === 0 ? (
            <p className="text-muted-foreground text-sm">No labels yet. Start reviewing to add labels.</p>
          ) : (
            session.labels.map(label => (
              <div key={label.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {label.label === 'pass' ? (
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-400" />
                    )}
                    <span className="font-medium capitalize">{label.label}</span>
                    <span className="text-sm text-muted-foreground">
                      Confidence: {Math.round(label.confidence * 100)}%
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(label.createdAt).toLocaleString()}
                  </span>
                </div>
                {label.critiques.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {label.critiques.map(c => (
                      <div key={c.id} className="text-sm p-2 bg-secondary/50 rounded">
                        <span className={`px-1.5 py-0.5 rounded text-xs mr-2 ${
                          c.severity === 'critical' ? 'bg-red-500/10 text-red-400' :
                          c.severity === 'major' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-gray-500/10 text-gray-400'
                        }`}>
                          {c.severity}
                        </span>
                        {c.category && <span className="text-muted-foreground mr-2">[{c.category}]</span>}
                        {c.content}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'comparisons' && (
        <div className="space-y-3">
          {session.comparisons.length === 0 ? (
            <p className="text-muted-foreground text-sm">No comparisons yet. Add pairwise comparisons to start A/B reviewing.</p>
          ) : (
            session.comparisons.map(comp => (
              <div key={comp.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">#{comp.order + 1}</span>
                    <span className="text-sm font-mono">A: {comp.evalCaseRunIdA.slice(0, 8)}...</span>
                    <span className="text-muted-foreground">vs</span>
                    <span className="text-sm font-mono">B: {comp.evalCaseRunIdB.slice(0, 8)}...</span>
                  </div>
                  {comp.votes.length > 0 ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      comp.votes[0].selectedWinner === 'A' ? 'bg-blue-500/10 text-blue-400' :
                      comp.votes[0].selectedWinner === 'B' ? 'bg-purple-500/10 text-purple-400' :
                      comp.votes[0].selectedWinner === 'tie' ? 'bg-gray-500/10 text-gray-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      Winner: {comp.votes[0].selectedWinner}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400">
                      Not voted
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
