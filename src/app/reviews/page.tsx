'use client'

import { useEffect, useState } from 'react'
import { Users, Plus } from 'lucide-react'

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

export default function ReviewsPage() {
  const [sessions, setSessions] = useState<ReviewSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/review-sessions')
      .then(r => r.json())
      .then(data => { setSessions(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

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
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          New Session
        </button>
      </div>

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
            <div
              key={session.id}
              className="border border-border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    session.type === 'blind-ab' ? 'bg-purple-500/10 text-purple-400' : 'bg-green-500/10 text-green-400'
                  }`}>
                    {session.type}
                  </span>
                  <span className="font-medium">{session.name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    session.status === 'active' ? 'bg-green-500/10 text-green-400' :
                    session.status === 'completed' ? 'bg-blue-500/10 text-blue-400' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>
                    {session.status}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {session.completedPairs}/{session.totalPairs} reviewed
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
