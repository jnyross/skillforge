'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { SearchSlash, ArrowLeft, Plus, BarChart3, Tag, FileText, Beaker } from 'lucide-react'

interface AnalysisSession {
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

interface AnalysisTrace {
  id: string
  traceId: string
  sequence: number
  openCodingNotes: string | null
  reviewedAt: string | null
  isNewFailureMode: boolean
  failureCategory: { id: string; name: string; severity: string } | null
  trace: { id: string; status: string; model: string; totalDurationMs: number; resultJson: string | null }
}

interface FailureCategory {
  id: string
  name: string
  description: string
  severity: string
  count: number
  _count: { traces: number }
}

interface SaturationMetrics {
  tracesReviewed: number
  totalTraces: number
  categoriesDiscovered: number
  newCategoriesInLast10: number
  saturationReached: boolean
  reviewProgress: number
}

interface EvalSuite {
  id: string
  name: string
}

type TabType = 'overview' | 'review' | 'categories' | 'generate'

export default function ErrorAnalysisDetailPage() {
  const params = useParams()
  const sessionId = params.id as string

  const [session, setSession] = useState<AnalysisSession | null>(null)
  const [traces, setTraces] = useState<AnalysisTrace[]>([])
  const [categories, setCategories] = useState<FailureCategory[]>([])
  const [saturation, setSaturation] = useState<SaturationMetrics | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [loading, setLoading] = useState(true)

  // Review state
  const [currentTraceIndex, setCurrentTraceIndex] = useState(0)
  const [codingNotes, setCodingNotes] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [isNewFailure, setIsNewFailure] = useState(false)
  const [saving, setSaving] = useState(false)

  // Category creation state
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryForm, setNewCategoryForm] = useState({ name: '', description: '', severity: 'major' })

  // Generate evals state
  const [suites, setSuites] = useState<EvalSuite[]>([])
  const [targetSuiteId, setTargetSuiteId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<{ created: number } | null>(null)

  const loadSession = useCallback(async () => {
    const [sessionRes, tracesRes, categoriesRes, saturationRes] = await Promise.all([
      fetch(`/api/error-analysis/${sessionId}`),
      fetch(`/api/error-analysis/${sessionId}/traces`),
      fetch(`/api/error-analysis/${sessionId}/categories`),
      fetch(`/api/error-analysis/${sessionId}/saturation`),
    ])

    if (sessionRes.ok) setSession(await sessionRes.json())
    if (tracesRes.ok) setTraces(await tracesRes.json())
    if (categoriesRes.ok) setCategories(await categoriesRes.json())
    if (saturationRes.ok) setSaturation(await saturationRes.json())
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    loadSession()
    fetch('/api/eval-suites').then(r => r.json()).then(setSuites).catch(() => {})
  }, [loadSession])

  const currentTrace = traces[currentTraceIndex]
  const unreviewedTraces = traces.filter(t => !t.reviewedAt)

  const saveTraceReview = async () => {
    if (!currentTrace) return
    setSaving(true)

    await fetch(`/api/error-analysis/${sessionId}/traces/${currentTrace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openCodingNotes: codingNotes,
        failureCategoryId: selectedCategoryId || null,
        isNewFailureMode: isNewFailure,
      }),
    })

    setCodingNotes('')
    setSelectedCategoryId('')
    setIsNewFailure(false)

    // Move to next unreviewed trace
    const nextUnreviewed = traces.findIndex((t, i) => i > currentTraceIndex && !t.reviewedAt)
    if (nextUnreviewed !== -1) {
      setCurrentTraceIndex(nextUnreviewed)
    } else if (currentTraceIndex < traces.length - 1) {
      setCurrentTraceIndex(currentTraceIndex + 1)
    }

    setSaving(false)
    loadSession()
  }

  const createCategory = async () => {
    if (!newCategoryForm.name) return
    await fetch(`/api/error-analysis/${sessionId}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCategoryForm),
    })
    setNewCategoryForm({ name: '', description: '', severity: 'major' })
    setShowNewCategory(false)
    loadSession()
  }

  const generateEvals = async () => {
    if (!targetSuiteId) return
    setGenerating(true)
    const res = await fetch(`/api/error-analysis/${sessionId}/generate-evals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetSuiteId }),
    })
    if (res.ok) {
      const result = await res.json()
      setGenerateResult(result)
    }
    setGenerating(false)
  }

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: BarChart3 },
    { id: 'review' as TabType, label: 'Review', icon: FileText },
    { id: 'categories' as TabType, label: 'Categories', icon: Tag },
    { id: 'generate' as TabType, label: 'Generate Evals', icon: Beaker },
  ]

  const severityColors: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-400',
    major: 'bg-orange-500/10 text-orange-400',
    minor: 'bg-yellow-500/10 text-yellow-400',
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>
  if (!session) return <div className="p-6 text-muted-foreground">Session not found</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/error-analysis" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
          <ArrowLeft className="h-3 w-3" /> Back to Error Analysis
        </Link>
        <div className="flex items-center gap-3">
          <SearchSlash className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{session.name}</h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            session.status === 'saturated' ? 'bg-purple-500/10 text-purple-400' :
            session.status === 'completed' ? 'bg-blue-500/10 text-blue-400' :
            'bg-green-500/10 text-green-400'
          }`}>
            {session.status}
          </span>
        </div>
        {session.description && <p className="text-muted-foreground mt-1">{session.description}</p>}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border border-border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Traces Sampled</div>
          <div className="text-2xl font-bold">{session._count.traces}</div>
        </div>
        <div className="border border-border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Reviewed</div>
          <div className="text-2xl font-bold">{saturation?.tracesReviewed || 0}</div>
          <div className="text-xs text-muted-foreground">{saturation ? `${Math.round(saturation.reviewProgress * 100)}%` : '0%'}</div>
        </div>
        <div className="border border-border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Categories</div>
          <div className="text-2xl font-bold">{session._count.categories}</div>
        </div>
        <div className="border border-border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Saturation</div>
          <div className="text-2xl font-bold">{saturation?.saturationReached ? 'Reached' : 'Not yet'}</div>
          <div className="text-xs text-muted-foreground">
            {saturation ? `${saturation.newCategoriesInLast10} new in last 10` : '—'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-border rounded-lg p-4">
              <h3 className="font-medium mb-2">Session Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Skill Repo</span><span>{session.skillRepo.displayName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Sampling</span><span>{session.samplingStrategy}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Target Count</span><span>{session.targetTraceCount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(session.createdAt).toLocaleString()}</span></div>
              </div>
            </div>
            <div className="border border-border rounded-lg p-4">
              <h3 className="font-medium mb-2">Saturation Curve</h3>
              {saturation ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Traces Reviewed</span><span>{saturation.tracesReviewed}/{saturation.totalTraces}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Categories Discovered</span><span>{saturation.categoriesDiscovered}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">New in Last 10</span><span>{saturation.newCategoriesInLast10}</span></div>
                  <div className="w-full bg-muted rounded-full h-2 mt-2">
                    <div className="bg-primary rounded-full h-2" style={{ width: `${saturation.reviewProgress * 100}%` }} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data yet. Start reviewing traces.</p>
              )}
            </div>
          </div>

          {/* Category summary */}
          {categories.length > 0 && (
            <div className="border border-border rounded-lg p-4">
              <h3 className="font-medium mb-3">Failure Categories</h3>
              <div className="space-y-2">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${severityColors[cat.severity] || ''}`}>{cat.severity}</span>
                      <span>{cat.name}</span>
                    </div>
                    <span className="text-muted-foreground">{cat._count.traces} traces</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Trace {currentTraceIndex + 1} of {traces.length} ({unreviewedTraces.length} remaining)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentTraceIndex(Math.max(0, currentTraceIndex - 1))}
                disabled={currentTraceIndex === 0}
                className="px-3 py-1 border border-border rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentTraceIndex(Math.min(traces.length - 1, currentTraceIndex + 1))}
                disabled={currentTraceIndex >= traces.length - 1}
                className="px-3 py-1 border border-border rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>

          {currentTrace ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Trace output */}
              <div className="border border-border rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  Trace Output
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    currentTrace.trace.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                    currentTrace.trace.status === 'passed' ? 'bg-green-500/10 text-green-400' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>
                    {currentTrace.trace.status}
                  </span>
                </h3>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Model: {currentTrace.trace.model || '—'}</span>
                    <span>{currentTrace.trace.totalDurationMs ? `${(currentTrace.trace.totalDurationMs / 1000).toFixed(1)}s` : '—'}</span>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[300px] whitespace-pre-wrap">
                    {currentTrace.trace.resultJson || 'No output captured'}
                  </pre>
                </div>
                {currentTrace.reviewedAt && (
                  <div className="mt-2 text-xs text-green-400">
                    Reviewed at {new Date(currentTrace.reviewedAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Coding form */}
              <div className="border border-border rounded-lg p-4 space-y-4">
                <h3 className="font-medium">Open Coding</h3>
                <div>
                  <label className="text-sm text-muted-foreground">Free-text Notes</label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                    rows={4}
                    placeholder="What do you observe? What went wrong? What patterns do you see?"
                    value={codingNotes}
                    onChange={e => setCodingNotes(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Failure Category</label>
                  <select
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                    value={selectedCategoryId}
                    onChange={e => setSelectedCategoryId(e.target.value)}
                  >
                    <option value="">None / Not yet categorized</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name} ({cat.severity})</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isNewFailure}
                    onChange={e => setIsNewFailure(e.target.checked)}
                  />
                  This is a new failure mode (not yet categorized)
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={saveTraceReview}
                    disabled={saving}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save & Next'}
                  </button>
                  <button
                    onClick={() => setShowNewCategory(true)}
                    className="flex items-center gap-1 px-3 py-2 border border-border rounded-md text-sm hover:bg-accent"
                  >
                    <Plus className="h-3 w-3" /> New Category
                  </button>
                </div>

                {showNewCategory && (
                  <div className="border border-border rounded p-3 space-y-2">
                    <input
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                      placeholder="Category name"
                      value={newCategoryForm.name}
                      onChange={e => setNewCategoryForm({ ...newCategoryForm, name: e.target.value })}
                    />
                    <textarea
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                      rows={2}
                      placeholder="Description"
                      value={newCategoryForm.description}
                      onChange={e => setNewCategoryForm({ ...newCategoryForm, description: e.target.value })}
                    />
                    <select
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                      value={newCategoryForm.severity}
                      onChange={e => setNewCategoryForm({ ...newCategoryForm, severity: e.target.value })}
                    >
                      <option value="critical">Critical</option>
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={createCategory}
                        disabled={!newCategoryForm.name}
                        className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => setShowNewCategory(false)}
                        className="px-3 py-1 border border-border rounded text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No traces sampled yet. The session may not have found any matching traces.
            </div>
          )}
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Failure Taxonomy</h3>
            <button
              onClick={() => setShowNewCategory(true)}
              className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Add Category
            </button>
          </div>

          {showNewCategory && (
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium">New Failure Category</h4>
              <div className="grid grid-cols-3 gap-3">
                <input
                  className="px-3 py-2 bg-background border border-border rounded-md text-sm"
                  placeholder="Category name"
                  value={newCategoryForm.name}
                  onChange={e => setNewCategoryForm({ ...newCategoryForm, name: e.target.value })}
                />
                <input
                  className="px-3 py-2 bg-background border border-border rounded-md text-sm"
                  placeholder="Description"
                  value={newCategoryForm.description}
                  onChange={e => setNewCategoryForm({ ...newCategoryForm, description: e.target.value })}
                />
                <select
                  className="px-3 py-2 bg-background border border-border rounded-md text-sm"
                  value={newCategoryForm.severity}
                  onChange={e => setNewCategoryForm({ ...newCategoryForm, severity: e.target.value })}
                >
                  <option value="critical">Critical</option>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createCategory}
                  disabled={!newCategoryForm.name}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
                >
                  Create Category
                </button>
                <button
                  onClick={() => setShowNewCategory(false)}
                  className="px-3 py-2 border border-border rounded-md text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="h-8 w-8 mx-auto mb-2" />
              <p>No failure categories yet. Review traces and create categories as you discover failure patterns.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.id} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityColors[cat.severity] || ''}`}>
                        {cat.severity}
                      </span>
                      <span className="font-medium">{cat.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{cat._count.traces} traces</span>
                  </div>
                  {cat.description && <p className="text-sm text-muted-foreground mt-2">{cat.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'generate' && (
        <div className="space-y-4">
          <div className="border border-border rounded-lg p-4 space-y-4">
            <h3 className="font-medium">Generate Eval Cases from Failure Categories</h3>
            <p className="text-sm text-muted-foreground">
              Create eval cases targeting each discovered failure category. Cases will be added to the selected eval suite
              with the &quot;error-analysis&quot; source tag for provenance tracking.
            </p>

            {categories.length === 0 ? (
              <p className="text-sm text-yellow-400">
                No failure categories discovered yet. Review traces and create categories first.
              </p>
            ) : (
              <>
                <div>
                  <label className="text-sm text-muted-foreground">Target Eval Suite</label>
                  <select
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                    value={targetSuiteId}
                    onChange={e => setTargetSuiteId(e.target.value)}
                  >
                    <option value="">Select suite...</option>
                    {suites.map((s: EvalSuite) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="text-sm">
                  <p>Will generate cases for {categories.length} categories:</p>
                  <ul className="mt-1 space-y-1">
                    {categories.map(cat => (
                      <li key={cat.id} className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${severityColors[cat.severity] || ''}`}>
                          {cat.severity}
                        </span>
                        {cat.name}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={generateEvals}
                  disabled={generating || !targetSuiteId}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {generating ? 'Generating...' : 'Generate Eval Cases'}
                </button>

                {generateResult && (
                  <div className="text-sm text-green-400">
                    Created {generateResult.created} eval cases from failure categories.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
