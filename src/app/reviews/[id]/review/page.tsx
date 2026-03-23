'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle, XCircle, Keyboard } from 'lucide-react'

interface Critique {
  content: string
  category: string
  severity: string
}

interface ReviewLabel {
  id: string
  evalCaseRunId: string
  label: string
  confidence: number
  critiques: Critique[]
}

interface PreferenceVote {
  id: string
  selectedWinner: string
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
  skillRepo: { displayName: string }
  comparisons: Comparison[]
  labels: ReviewLabel[]
}

export default function ActiveReviewPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [session, setSession] = useState<ReviewSessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [confidence, setConfidence] = useState(0.7)
  const [critique, setCritique] = useState('')
  const [critiqueCategory, setCritiqueCategory] = useState('')
  const [critiqueSeverity, setCritiqueSeverity] = useState('minor')
  const [submitting, setSubmitting] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [thinkAloud, setThinkAloud] = useState('')
  const startTimeRef = useRef<number>(Date.now())

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/review-sessions/${id}`)
    if (res.ok) {
      const data = await res.json()
      setSession(data)
      // Find first unreviewed item
      if (data.type === 'blind-ab') {
        const firstUnvoted = data.comparisons.findIndex((c: Comparison) => c.votes.length === 0)
        if (firstUnvoted >= 0) setCurrentIndex(firstUnvoted)
      } else {
        setCurrentIndex(data.labels.length)
      }
    }
    setLoading(false)
  }, [id])

  useEffect(() => { loadSession() }, [loadSession])

  // Reset timer when changing items
  useEffect(() => {
    startTimeRef.current = Date.now()
    setCritique('')
    setCritiqueCategory('')
    setThinkAloud('')
    setConfidence(0.7)
  }, [currentIndex])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (!session || session.status !== 'active') return

      if (session.type === 'pass-fail') {
        if (e.key === 'p' || e.key === 'P') { handlePassFail('pass'); e.preventDefault() }
        if (e.key === 'f' || e.key === 'F') { handlePassFail('fail'); e.preventDefault() }
      } else {
        if (e.key === 'a' || e.key === 'A' || e.key === '1') { handleVote('A'); e.preventDefault() }
        if (e.key === 'b' || e.key === 'B' || e.key === '2') { handleVote('B'); e.preventDefault() }
        if (e.key === 't' || e.key === 'T') { handleVote('tie'); e.preventDefault() }
        if (e.key === 'x' || e.key === 'X') { handleVote('both-bad'); e.preventDefault() }
      }

      if (e.key === 'ArrowLeft') { navigatePrev(); e.preventDefault() }
      if (e.key === 'ArrowRight') { navigateNext(); e.preventDefault() }
      if (e.key === '?') { setShowShortcuts(s => !s); e.preventDefault() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const navigatePrev = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1)
  }

  const navigateNext = () => {
    if (!session) return
    const max = session.type === 'blind-ab' ? session.comparisons.length - 1 : session.totalPairs - 1
    if (currentIndex < max) setCurrentIndex(i => i + 1)
  }

  const handlePassFail = async (label: string) => {
    if (submitting || !session) return
    setSubmitting(true)
    const durationMs = Date.now() - startTimeRef.current

    const critiques = critique.trim() ? [{
      content: critique.trim(),
      category: critiqueCategory || '',
      severity: critiqueSeverity,
    }] : undefined

    await fetch(`/api/review-sessions/${id}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evalCaseRunId: `review-item-${currentIndex}`,
        label,
        confidence,
        critiques,
      }),
    })

    setSubmitting(false)
    await loadSession()
    navigateNext()
  }

  const handleVote = async (winner: string) => {
    if (submitting || !session) return
    const comp = session.comparisons[currentIndex]
    if (!comp) return
    setSubmitting(true)
    const durationMs = Date.now() - startTimeRef.current

    await fetch(`/api/review-sessions/${id}/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comparisonId: comp.id,
        selectedWinner: winner,
        confidence,
        durationMs,
      }),
    })

    setSubmitting(false)
    await loadSession()
    navigateNext()
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>
  if (!session) return <div className="p-6 text-red-400">Session not found</div>

  const totalItems = session.type === 'blind-ab' ? session.comparisons.length : session.totalPairs
  const progress = totalItems > 0 ? Math.round((session.completedPairs / totalItems) * 100) : 0

  return (
    <div className="p-6 space-y-6">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/reviews/${id}`} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{session.name}</h1>
            <p className="text-sm text-muted-foreground">
              {session.type === 'blind-ab' ? 'Blind A/B Comparison' : 'Pass/Fail Review'}
              {' '}&middot; Version identity hidden
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowShortcuts(s => !s)}
            className="text-muted-foreground hover:text-foreground"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-5 w-5" />
          </button>
          <span className="text-sm text-muted-foreground">
            {session.completedPairs}/{totalItems} reviewed
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-secondary rounded-full h-2">
        <div
          className="bg-primary rounded-full h-2 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Keyboard shortcuts panel */}
      {showShortcuts && (
        <div className="border border-border rounded-lg p-4 bg-secondary/30">
          <h3 className="font-medium mb-2">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {session.type === 'pass-fail' ? (
              <>
                <div><kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">P</kbd> Pass</div>
                <div><kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">F</kbd> Fail</div>
              </>
            ) : (
              <>
                <div><kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">A / 1</kbd> Select A</div>
                <div><kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">B / 2</kbd> Select B</div>
                <div><kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">T</kbd> Tie</div>
                <div><kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">X</kbd> Both bad</div>
              </>
            )}
            <div><kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">&larr;</kbd> Previous</div>
            <div><kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">&rarr;</kbd> Next</div>
            <div><kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">?</kbd> Toggle shortcuts</div>
          </div>
        </div>
      )}

      {/* Review content */}
      {session.status !== 'active' ? (
        <div className="border border-border rounded-lg p-12 text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-blue-400 mb-4" />
          <h3 className="text-lg font-medium mb-2">Session {session.status}</h3>
          <p className="text-muted-foreground">
            This review session is no longer active.
          </p>
          <Link
            href={`/reviews/${id}`}
            className="inline-block mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
          >
            View Results
          </Link>
        </div>
      ) : session.type === 'blind-ab' ? (
        /* Blind A/B review mode */
        <div className="space-y-4">
          {session.comparisons.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-12 text-center">
              <p className="text-muted-foreground">No comparisons added yet. Add pairwise comparisons to start reviewing.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button
                  onClick={navigatePrev}
                  disabled={currentIndex === 0}
                  className="p-2 border border-border rounded-md hover:bg-accent disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm text-muted-foreground">
                  Comparison {currentIndex + 1} of {session.comparisons.length}
                </span>
                <button
                  onClick={navigateNext}
                  disabled={currentIndex >= session.comparisons.length - 1}
                  className="p-2 border border-border rounded-md hover:bg-accent disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              {session.comparisons[currentIndex] && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-border rounded-lg p-4">
                    <h3 className="font-medium text-center mb-3 text-blue-400">Output A</h3>
                    <div className="bg-secondary/30 rounded p-3 min-h-[200px] font-mono text-sm whitespace-pre-wrap">
                      {session.comparisons[currentIndex].evalCaseRunIdA}
                    </div>
                  </div>
                  <div className="border border-border rounded-lg p-4">
                    <h3 className="font-medium text-center mb-3 text-purple-400">Output B</h3>
                    <div className="bg-secondary/30 rounded p-3 min-h-[200px] font-mono text-sm whitespace-pre-wrap">
                      {session.comparisons[currentIndex].evalCaseRunIdB}
                    </div>
                  </div>
                </div>
              )}

              {/* Vote buttons */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => handleVote('A')}
                  disabled={submitting}
                  className="px-6 py-3 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg font-medium hover:bg-blue-500/30 disabled:opacity-50"
                >
                  A is Better (A)
                </button>
                <button
                  onClick={() => handleVote('tie')}
                  disabled={submitting}
                  className="px-6 py-3 bg-gray-500/20 border border-gray-500/30 text-gray-400 rounded-lg font-medium hover:bg-gray-500/30 disabled:opacity-50"
                >
                  Tie (T)
                </button>
                <button
                  onClick={() => handleVote('B')}
                  disabled={submitting}
                  className="px-6 py-3 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-lg font-medium hover:bg-purple-500/30 disabled:opacity-50"
                >
                  B is Better (B)
                </button>
                <button
                  onClick={() => handleVote('both-bad')}
                  disabled={submitting}
                  className="px-6 py-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg font-medium hover:bg-red-500/30 disabled:opacity-50"
                >
                  Both Bad (X)
                </button>
              </div>

              {/* Confidence slider */}
              <div className="max-w-md mx-auto">
                <label className="text-sm text-muted-foreground">Confidence: {Math.round(confidence * 100)}%</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={confidence}
                  onChange={e => setConfidence(parseFloat(e.target.value))}
                  className="w-full mt-1"
                />
              </div>
            </>
          )}
        </div>
      ) : (
        /* Pass/Fail review mode */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={navigatePrev}
              disabled={currentIndex === 0}
              className="p-2 border border-border rounded-md hover:bg-accent disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm text-muted-foreground">
              Item {currentIndex + 1}
            </span>
            <button
              onClick={navigateNext}
              disabled={false}
              className="p-2 border border-border rounded-md hover:bg-accent disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Output display */}
          <div className="border border-border rounded-lg p-4">
            <h3 className="font-medium mb-3">Output to Review</h3>
            <div className="bg-secondary/30 rounded p-3 min-h-[200px] font-mono text-sm whitespace-pre-wrap">
              Review item #{currentIndex + 1}
              {'\n\n'}Add eval case runs to this session to see actual output content here.
            </div>
          </div>

          {/* Critique input */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-medium">Critique (optional)</h3>
            <textarea
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm min-h-[80px]"
              placeholder="What could be improved? Be specific and actionable..."
              value={critique}
              onChange={e => setCritique(e.target.value)}
            />
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Category</label>
                <input
                  className="w-full mt-1 px-3 py-1.5 bg-background border border-border rounded-md text-sm"
                  placeholder="e.g. accuracy, completeness, style"
                  value={critiqueCategory}
                  onChange={e => setCritiqueCategory(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Severity</label>
                <select
                  className="w-full mt-1 px-3 py-1.5 bg-background border border-border rounded-md text-sm"
                  value={critiqueSeverity}
                  onChange={e => setCritiqueSeverity(e.target.value)}
                >
                  <option value="minor">Minor</option>
                  <option value="major">Major</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
          </div>

          {/* Think-aloud notes */}
          <div className="border border-border rounded-lg p-4">
            <label className="text-sm text-muted-foreground">Think-aloud notes (optional)</label>
            <textarea
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm min-h-[60px]"
              placeholder="Your reasoning process..."
              value={thinkAloud}
              onChange={e => setThinkAloud(e.target.value)}
            />
          </div>

          {/* Confidence slider */}
          <div>
            <label className="text-sm text-muted-foreground">Confidence: {Math.round(confidence * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={confidence}
              onChange={e => setConfidence(parseFloat(e.target.value))}
              className="w-full mt-1"
            />
          </div>

          {/* Pass/Fail buttons */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => handlePassFail('pass')}
              disabled={submitting}
              className="flex items-center gap-2 px-8 py-3 bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg font-medium hover:bg-green-500/30 disabled:opacity-50"
            >
              <CheckCircle className="h-5 w-5" />
              Pass (P)
            </button>
            <button
              onClick={() => handlePassFail('fail')}
              disabled={submitting}
              className="flex items-center gap-2 px-8 py-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg font-medium hover:bg-red-500/30 disabled:opacity-50"
            >
              <XCircle className="h-5 w-5" />
              Fail (F)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
