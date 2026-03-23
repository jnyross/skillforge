'use client'

import { useEffect, useState } from 'react'
import { Scale, Plus } from 'lucide-react'

interface JudgeDefinition {
  id: string
  name: string
  purpose: string
  scope: string
  targetCriterion: string
  model: string
  status: string
  createdAt: string
  _count: { promptVersions: number; calibrationRuns: number; examples: number }
}

export default function JudgesPage() {
  const [judges, setJudges] = useState<JudgeDefinition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/judges')
      .then(r => r.json())
      .then(data => { setJudges(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-500/10 text-gray-400',
    candidate: 'bg-amber-500/10 text-amber-400',
    calibrated: 'bg-green-500/10 text-green-400',
    deprecated: 'bg-red-500/10 text-red-400',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="h-6 w-6" />
            Judges
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and calibrate LLM judges against human labels
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          New Judge
        </button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : judges.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <Scale className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No judges yet</h3>
          <p className="text-muted-foreground mb-4">
            Create judges from human-labeled review data. Only calibrated judges
            can influence promotion scores.
          </p>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Features: binary judge prompts, calibration pipeline,</p>
            <p>confusion matrix, TPR/TNR/precision/recall, drift detection</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {judges.map(judge => (
            <div
              key={judge.id}
              className="border border-border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[judge.status] || ''}`}>
                    {judge.status}
                  </span>
                  <span className="font-medium">{judge.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{judge._count.examples} examples</span>
                  <span>{judge._count.calibrationRuns} calibrations</span>
                  <span>{judge.model}</span>
                </div>
              </div>
              {judge.purpose && (
                <p className="text-sm text-muted-foreground mt-2">{judge.purpose}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
