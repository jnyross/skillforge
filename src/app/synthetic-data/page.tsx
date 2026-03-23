'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Database, Plus, ChevronRight, Loader2 } from 'lucide-react'

interface SyntheticConfig {
  id: string
  name: string
  status: string
  createdAt: string
  evalSuite: { id: string; name: string; type: string }
  _count: { dimensions: number; generatedTuples: number }
}

interface EvalSuite {
  id: string
  name: string
  type: string
  skillRepo: { displayName: string }
}

export default function SyntheticDataPage() {
  const [configs, setConfigs] = useState<SyntheticConfig[]>([])
  const [suites, setSuites] = useState<EvalSuite[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', evalSuiteId: '' })
  const [creating, setCreating] = useState(false)

  const loadConfigs = useCallback(async () => {
    const res = await fetch('/api/synthetic-data')
    if (res.ok) setConfigs(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    loadConfigs()
    fetch('/api/eval-suites').then(r => r.json()).then(setSuites).catch(() => {})
  }, [loadConfigs])

  const createConfig = async () => {
    if (!form.name || !form.evalSuiteId) return
    setCreating(true)
    const res = await fetch('/api/synthetic-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ name: '', evalSuiteId: '' })
      setShowCreate(false)
      loadConfigs()
    }
    setCreating(false)
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-500/10 text-gray-400',
    generating: 'bg-blue-500/10 text-blue-400',
    review: 'bg-yellow-500/10 text-yellow-400',
    committed: 'bg-green-500/10 text-green-400',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" /> Synthetic Data
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate eval cases from dimension cross-products with LLM expansion
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New Config
        </button>
      </div>

      {showCreate && (
        <div className="border border-border rounded-lg p-4 space-y-4">
          <h3 className="font-medium">Create Synthetic Data Config</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Name *</label>
              <input
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                placeholder="e.g. Math variations"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Target Suite *</label>
              <select
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                value={form.evalSuiteId}
                onChange={e => setForm({ ...form, evalSuiteId: e.target.value })}
              >
                <option value="">Select suite...</option>
                {suites.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createConfig}
              disabled={creating || !form.name || !form.evalSuiteId}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : configs.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No synthetic data configs</h3>
          <p className="text-muted-foreground mb-4">
            Create a config to define dimensions and generate eval cases automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map(config => (
            <Link
              key={config.id}
              href={`/synthetic-data/${config.id}`}
              className="block border border-border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[config.status] || ''}`}>
                    {config.status}
                  </span>
                  <span className="font-medium">{config.name}</span>
                  <span className="text-sm text-muted-foreground">
                    Suite: {config.evalSuite.name}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{config._count.dimensions} dimensions</span>
                  <span>{config._count.generatedTuples} tuples</span>
                  <span>{new Date(config.createdAt).toLocaleDateString()}</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
