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

export default function EvalsPage() {
  const [suites, setSuites] = useState<EvalSuite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/eval-suites')
      .then(r => r.json())
      .then(data => { setSuites(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

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
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          New Suite
        </button>
      </div>

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
