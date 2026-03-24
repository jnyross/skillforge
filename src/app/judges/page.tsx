'use client'

import { useEffect, useState, useCallback } from 'react'
import { Scale, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'

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
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '', purpose: '', scope: '', targetCriterion: '', model: 'claude-opus-4-6',
    systemPrompt: '', userPromptTemplate: '',
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadJudges = useCallback(async () => {
    const res = await fetch('/api/judges')
    if (res.ok) {
      setJudges(await res.json())
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadJudges() }, [loadJudges])

  const createJudge = async () => {
    if (!form.name) return
    setCreating(true)
    setError('')
    const res = await fetch('/api/judges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ name: '', purpose: '', scope: '', targetCriterion: '', model: 'claude-opus-4-6', systemPrompt: '', userPromptTemplate: '' })
      setShowCreate(false)
      loadJudges()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to create judge')
    }
    setCreating(false)
  }

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
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Judge
        </button>
      </div>

      {showCreate && (
        <div className="border border-border rounded-lg p-4 space-y-4">
          <h3 className="font-medium">Create Judge</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Name *</label>
              <input
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                placeholder="e.g. Code Quality Judge"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Model</label>
              <input
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Purpose</label>
              <input
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                placeholder="What does this judge evaluate?"
                value={form.purpose}
                onChange={e => setForm({ ...form, purpose: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Target Criterion</label>
              <input
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                placeholder="e.g. Does the output follow coding conventions?"
                value={form.targetCriterion}
                onChange={e => setForm({ ...form, targetCriterion: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Scope</label>
              <input
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                placeholder="e.g. TypeScript skills"
                value={form.scope}
                onChange={e => setForm({ ...form, scope: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">System Prompt (optional, creates v1)</label>
            <textarea
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm font-mono min-h-[80px]"
              placeholder="You are a binary judge..."
              value={form.systemPrompt}
              onChange={e => setForm({ ...form, systemPrompt: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">User Prompt Template (optional)</label>
            <textarea
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm font-mono min-h-[80px]"
              placeholder={'Use {{input}} and {{criterion}} as placeholders'}
              value={form.userPromptTemplate}
              onChange={e => setForm({ ...form, userPromptTemplate: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={createJudge}
              disabled={creating || !form.name}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Judge'}
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
            <Link
              key={judge.id}
              href={`/judges/${judge.id}`}
              className="block border border-border rounded-lg p-4 hover:bg-accent transition-colors"
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
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
              {judge.purpose && (
                <p className="text-sm text-muted-foreground mt-2">{judge.purpose}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
