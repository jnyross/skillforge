'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Database, Plus, Trash2, Wand2, Check, X, Loader2
} from 'lucide-react'

interface SyntheticConfig {
  id: string
  name: string
  status: string
  evalSuiteId: string
  evalSuite: { id: string; name: string; type: string }
  dimensions: Dimension[]
  generatedTuples: Tuple[]
}

interface Dimension {
  id: string
  name: string
  values: string
  order: number
}

interface Tuple {
  id: string
  dimensionValues: string
  naturalLanguage: string
  expectedOutcome: string
  included: boolean
  evalCaseId: string | null
}

export default function SyntheticDataDetailPage() {
  const params = useParams()
  const router = useRouter()
  const configId = params.id as string

  const [config, setConfig] = useState<SyntheticConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddDimension, setShowAddDimension] = useState(false)
  const [newDim, setNewDim] = useState({ name: '', values: '' })
  const [expanding, setExpanding] = useState(false)
  const [committing, setCommitting] = useState(false)

  const loadConfig = useCallback(async () => {
    const res = await fetch(`/api/synthetic-data/${configId}`)
    if (!res.ok) { router.push('/synthetic-data'); return }
    setConfig(await res.json())
    setLoading(false)
  }, [configId, router])

  useEffect(() => { loadConfig() }, [loadConfig])

  const addDimension = async () => {
    if (!newDim.name || !newDim.values) return
    let valuesArray: string[]
    try {
      valuesArray = JSON.parse(newDim.values)
      if (!Array.isArray(valuesArray)) throw new Error('not array')
    } catch {
      valuesArray = newDim.values.split(',').map(v => v.trim()).filter(Boolean)
    }
    await fetch(`/api/synthetic-data/${configId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addDimension: { name: newDim.name, values: JSON.stringify(valuesArray) },
      }),
    })
    setNewDim({ name: '', values: '' })
    setShowAddDimension(false)
    loadConfig()
  }

  const deleteDimension = async (dimId: string) => {
    await fetch(`/api/synthetic-data/${configId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeDimensionId: dimId }),
    })
    loadConfig()
  }

  const expand = async () => {
    setExpanding(true)
    await fetch(`/api/synthetic-data/${configId}/expand`, { method: 'POST' })
    setExpanding(false)
    loadConfig()
  }

  const toggleTuple = async (tupleId: string, included: boolean) => {
    await fetch(`/api/synthetic-data/${configId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggleTupleId: tupleId, included }),
    })
    loadConfig()
  }

  const commit = async () => {
    setCommitting(true)
    await fetch(`/api/synthetic-data/${configId}/commit`, { method: 'POST' })
    setCommitting(false)
    loadConfig()
  }

  if (loading || !config) {
    return <div className="p-6 text-muted-foreground">Loading...</div>
  }

  const includedCount = config.generatedTuples.filter(t => t.included).length

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/synthetic-data" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ChevronLeft className="h-4 w-4" /> Back to Synthetic Data
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="h-6 w-6" />
            <h1 className="text-2xl font-bold">{config.name}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              config.status === 'committed' ? 'bg-green-500/10 text-green-400' :
              config.status === 'review' ? 'bg-yellow-500/10 text-yellow-400' :
              'bg-gray-500/10 text-gray-400'
            }`}>
              {config.status}
            </span>
          </div>
          <div className="flex gap-2">
            {config.dimensions.length >= 2 && config.status !== 'committed' && (
              <button
                onClick={expand}
                disabled={expanding}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {expanding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {expanding ? 'Generating...' : 'Expand Tuples'}
              </button>
            )}
            {config.generatedTuples.length > 0 && config.status !== 'committed' && (
              <button
                onClick={commit}
                disabled={committing || includedCount === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {committing ? 'Committing...' : `Commit ${includedCount} Cases`}
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Suite: {config.evalSuite.name} ({config.evalSuite.type})
        </p>
      </div>

      {/* Dimensions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Dimensions ({config.dimensions.length})</h2>
          {config.status !== 'committed' && (
            <button
              onClick={() => setShowAddDimension(!showAddDimension)}
              className="flex items-center gap-1 px-3 py-1.5 border border-dashed border-border rounded-md text-sm text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Add Dimension
            </button>
          )}
        </div>

        {showAddDimension && (
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <input
                  type="text"
                  value={newDim.name}
                  onChange={e => setNewDim({ ...newDim, name: e.target.value })}
                  placeholder="e.g. difficulty"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Values (comma-separated)</label>
                <input
                  type="text"
                  value={newDim.values}
                  onChange={e => setNewDim({ ...newDim, values: e.target.value })}
                  placeholder="easy, medium, hard"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addDimension} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm">Add</button>
              <button onClick={() => setShowAddDimension(false)} className="px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent">Cancel</button>
            </div>
          </div>
        )}

        {config.dimensions.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
            Add at least 2 dimensions to generate cross-product tuples.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {config.dimensions.map(dim => {
              let values: string[] = []
              try { values = JSON.parse(dim.values) } catch { values = [dim.values] }
              return (
                <div key={dim.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{dim.name}</span>
                    {config.status !== 'committed' && (
                      <button onClick={() => deleteDimension(dim.id)} className="text-muted-foreground hover:text-red-400">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {values.map((v, i) => (
                      <span key={i} className="px-2 py-0.5 bg-secondary rounded text-xs">{v}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Generated Tuples */}
      {config.generatedTuples.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            Generated Tuples ({includedCount}/{config.generatedTuples.length} included)
          </h2>
          <div className="space-y-2">
            {config.generatedTuples.map(tuple => {
              let dimVals: Record<string, string> = {}
              try { dimVals = JSON.parse(tuple.dimensionValues) } catch { /* empty */ }
              return (
                <div key={tuple.id} className={`border rounded-lg p-3 ${tuple.included ? 'border-border' : 'border-border/50 opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {Object.entries(dimVals).map(([k, v]) => (
                        <span key={k} className="px-2 py-0.5 bg-secondary rounded text-xs">
                          {k}: {v}
                        </span>
                      ))}
                      {tuple.evalCaseId && (
                        <span className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-xs">committed</span>
                      )}
                    </div>
                    {config.status !== 'committed' && (
                      <button
                        onClick={() => toggleTuple(tuple.id, !tuple.included)}
                        className="text-sm"
                      >
                        {tuple.included ? <X className="h-4 w-4 text-red-400" /> : <Check className="h-4 w-4 text-green-400" />}
                      </button>
                    )}
                  </div>
                  {tuple.naturalLanguage && (
                    <p className="text-sm mt-2">{tuple.naturalLanguage}</p>
                  )}
                  {tuple.expectedOutcome && (
                    <p className="text-xs text-muted-foreground mt-1">Expected: {tuple.expectedOutcome}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
