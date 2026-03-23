'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Scale, Plus, Play, ArrowLeft, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

interface PromptVersion {
  id: string
  version: number
  systemPrompt: string
  userPromptTemplate: string
  active: boolean
  createdAt: string
}

interface CalibrationRun {
  id: string
  promptVersionId: string
  status: string
  totalExamples: number
  truePositives: number
  trueNegatives: number
  falsePositives: number
  falseNegatives: number
  precision: number | null
  recall: number | null
  agreementRate: number | null
  metricsJson: string
  createdAt: string
  completedAt: string | null
}

interface JudgeExample {
  id: string
  input: string
  expectedLabel: string
  humanCritique: string
  split: string
  createdAt: string
}

interface JudgeDetail {
  id: string
  name: string
  purpose: string
  scope: string
  targetCriterion: string
  model: string
  outputSchema: string
  status: string
  createdAt: string
  updatedAt: string
  promptVersions: PromptVersion[]
  calibrationRuns: CalibrationRun[]
  examples: JudgeExample[]
}

export default function JudgeDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [judge, setJudge] = useState<JudgeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'prompts' | 'examples' | 'calibration'>('overview')
  const [showAddPrompt, setShowAddPrompt] = useState(false)
  const [showAddExample, setShowAddExample] = useState(false)
  const [promptForm, setPromptForm] = useState({ systemPrompt: '', userPromptTemplate: '' })
  const [exampleForm, setExampleForm] = useState({ input: '', expectedLabel: 'pass', humanCritique: '', split: 'validation' })
  const [submitting, setSubmitting] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const [error, setError] = useState('')

  const loadJudge = useCallback(async () => {
    const res = await fetch(`/api/judges/${id}`)
    if (res.ok) {
      setJudge(await res.json())
    }
    setLoading(false)
  }, [id])

  useEffect(() => { loadJudge() }, [loadJudge])

  const addPromptVersion = async () => {
    if (!promptForm.systemPrompt && !promptForm.userPromptTemplate) return
    setSubmitting(true)
    setError('')
    const res = await fetch(`/api/judges/${id}/prompt-versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptForm),
    })
    if (res.ok) {
      setPromptForm({ systemPrompt: '', userPromptTemplate: '' })
      setShowAddPrompt(false)
      loadJudge()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to add prompt version')
    }
    setSubmitting(false)
  }

  const addExample = async () => {
    if (!exampleForm.input || !exampleForm.expectedLabel) return
    setSubmitting(true)
    setError('')
    const res = await fetch(`/api/judges/${id}/examples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exampleForm),
    })
    if (res.ok) {
      setExampleForm({ input: '', expectedLabel: 'pass', humanCritique: '', split: 'validation' })
      setShowAddExample(false)
      loadJudge()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to add example')
    }
    setSubmitting(false)
  }

  const runCalibration = async () => {
    setCalibrating(true)
    setError('')
    const res = await fetch(`/api/judges/${id}/calibrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      // Poll for completion
      const pollInterval = setInterval(async () => {
        await loadJudge()
      }, 2000)
      setTimeout(() => clearInterval(pollInterval), 60000)
      setCalibrating(false)
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to start calibration')
      setCalibrating(false)
    }
  }

  const updateStatus = async (status: string) => {
    await fetch(`/api/judges/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadJudge()
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>
  if (!judge) return <div className="p-6 text-red-400">Judge not found</div>

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-500/10 text-gray-400',
    candidate: 'bg-amber-500/10 text-amber-400',
    calibrated: 'bg-green-500/10 text-green-400',
    deprecated: 'bg-red-500/10 text-red-400',
  }

  const latestCalibration = judge.calibrationRuns[0]
  const trainExamples = judge.examples.filter(e => e.split === 'train')
  const validationExamples = judge.examples.filter(e => e.split === 'validation')
  const holdoutExamples = judge.examples.filter(e => e.split === 'holdout')

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/judges" className="hover:text-foreground">Judges</Link>
        <span>/</span>
        <span className="text-foreground">{judge.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Scale className="h-6 w-6" />
            {judge.name}
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[judge.status] || ''}`}>
              {judge.status}
            </span>
          </h1>
          <p className="text-muted-foreground mt-1">
            {judge.purpose || 'No purpose set'} &middot; Model: {judge.model}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runCalibration}
            disabled={calibrating}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {calibrating ? 'Running...' : 'Run Calibration'}
          </button>
          {judge.status === 'draft' && (
            <button
              onClick={() => updateStatus('candidate')}
              className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent"
            >
              Promote to Candidate
            </button>
          )}
          {judge.status === 'calibrated' && (
            <button
              onClick={() => updateStatus('deprecated')}
              className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent text-red-400"
            >
              Deprecate
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Prompt Versions</p>
          <p className="text-2xl font-bold mt-1">{judge.promptVersions.length}</p>
        </div>
        <div className="border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Examples</p>
          <p className="text-2xl font-bold mt-1">{judge.examples.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {trainExamples.length} train / {validationExamples.length} val / {holdoutExamples.length} holdout
          </p>
        </div>
        <div className="border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Calibration Runs</p>
          <p className="text-2xl font-bold mt-1">{judge.calibrationRuns.length}</p>
        </div>
        <div className="border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Agreement Rate</p>
          <p className="text-2xl font-bold mt-1">
            {latestCalibration?.agreementRate != null
              ? `${Math.round(latestCalibration.agreementRate * 100)}%`
              : '—'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6">
          {(['overview', 'prompts', 'examples', 'calibration'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium border-b-2 ${
                tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="border border-border rounded-lg p-4">
            <h3 className="font-medium mb-2">Judge Info</h3>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Purpose</dt>
              <dd>{judge.purpose || '—'}</dd>
              <dt className="text-muted-foreground">Scope</dt>
              <dd>{judge.scope || '—'}</dd>
              <dt className="text-muted-foreground">Target Criterion</dt>
              <dd>{judge.targetCriterion || '—'}</dd>
              <dt className="text-muted-foreground">Model</dt>
              <dd>{judge.model}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{judge.status}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{new Date(judge.createdAt).toLocaleString()}</dd>
            </dl>
          </div>

          {judge.status !== 'calibrated' && (
            <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
              <div>
                <p className="font-medium text-amber-400">Uncalibrated Judge</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This judge cannot influence promotion scores until it is calibrated.
                  Add validation examples and run calibration to align with human labels.
                </p>
              </div>
            </div>
          )}

          {/* Latest calibration metrics */}
          {latestCalibration && latestCalibration.status === 'completed' && (
            <ConfusionMatrixDisplay calibration={latestCalibration} />
          )}
        </div>
      )}

      {tab === 'prompts' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Prompt Versions</h3>
            <button
              onClick={() => setShowAddPrompt(!showAddPrompt)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Version
            </button>
          </div>

          {showAddPrompt && (
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">System Prompt</label>
                <textarea
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm font-mono min-h-[120px]"
                  placeholder="You are a binary judge. Evaluate the following..."
                  value={promptForm.systemPrompt}
                  onChange={e => setPromptForm({ ...promptForm, systemPrompt: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">User Prompt Template</label>
                <textarea
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm font-mono min-h-[120px]"
                  placeholder={'Use {{input}} and {{criterion}} as placeholders.\n\nExample: Evaluate this output:\n{{input}}\n\nCriterion: {{criterion}}'}
                  value={promptForm.userPromptTemplate}
                  onChange={e => setPromptForm({ ...promptForm, userPromptTemplate: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addPromptVersion}
                  disabled={submitting || (!promptForm.systemPrompt && !promptForm.userPromptTemplate)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Version'}
                </button>
                <button
                  onClick={() => setShowAddPrompt(false)}
                  className="px-4 py-2 border border-border rounded-md text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {judge.promptVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No prompt versions yet.</p>
          ) : (
            judge.promptVersions.map(pv => (
              <div key={pv.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">v{pv.version}</span>
                    {pv.active && (
                      <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400">active</span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(pv.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {pv.systemPrompt && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">System Prompt</p>
                    <pre className="text-sm bg-secondary/30 rounded p-2 whitespace-pre-wrap max-h-[150px] overflow-auto">
                      {pv.systemPrompt}
                    </pre>
                  </div>
                )}
                {pv.userPromptTemplate && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">User Prompt Template</p>
                    <pre className="text-sm bg-secondary/30 rounded p-2 whitespace-pre-wrap max-h-[150px] overflow-auto">
                      {pv.userPromptTemplate}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'examples' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">
              Training Examples
              <span className="text-sm text-muted-foreground font-normal ml-2">
                ({trainExamples.length} train / {validationExamples.length} validation / {holdoutExamples.length} holdout)
              </span>
            </h3>
            <button
              onClick={() => setShowAddExample(!showAddExample)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Example
            </button>
          </div>

          {showAddExample && (
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Input *</label>
                <textarea
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm min-h-[100px]"
                  placeholder="The input to evaluate..."
                  value={exampleForm.input}
                  onChange={e => setExampleForm({ ...exampleForm, input: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Expected Label *</label>
                  <select
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                    value={exampleForm.expectedLabel}
                    onChange={e => setExampleForm({ ...exampleForm, expectedLabel: e.target.value })}
                  >
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Split</label>
                  <select
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                    value={exampleForm.split}
                    onChange={e => setExampleForm({ ...exampleForm, split: e.target.value })}
                  >
                    <option value="train">Train</option>
                    <option value="validation">Validation</option>
                    <option value="holdout">Holdout</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Human Critique</label>
                <textarea
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm min-h-[60px]"
                  placeholder="Why this should pass or fail..."
                  value={exampleForm.humanCritique}
                  onChange={e => setExampleForm({ ...exampleForm, humanCritique: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addExample}
                  disabled={submitting || !exampleForm.input}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Example'}
                </button>
                <button
                  onClick={() => setShowAddExample(false)}
                  className="px-4 py-2 border border-border rounded-md text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {judge.examples.length === 0 ? (
            <p className="text-sm text-muted-foreground">No examples yet. Add labeled examples for calibration.</p>
          ) : (
            judge.examples.map(ex => (
              <div key={ex.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {ex.expectedLabel === 'pass' ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <span className="text-sm font-medium capitalize">{ex.expectedLabel}</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-secondary text-muted-foreground">
                      {ex.split}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(ex.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <pre className="text-sm bg-secondary/30 rounded p-2 whitespace-pre-wrap max-h-[100px] overflow-auto">
                  {ex.input}
                </pre>
                {ex.humanCritique && (
                  <p className="text-sm text-muted-foreground mt-2 italic">{ex.humanCritique}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'calibration' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Calibration Runs</h3>
            <button
              onClick={runCalibration}
              disabled={calibrating}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {calibrating ? 'Running...' : 'New Calibration'}
            </button>
          </div>

          {judge.calibrationRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calibration runs yet. Add examples and run calibration.</p>
          ) : (
            judge.calibrationRuns.map(run => (
              <div key={run.id} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      run.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                      run.status === 'running' ? 'bg-blue-500/10 text-blue-400' :
                      run.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                      'bg-gray-500/10 text-gray-400'
                    }`}>
                      {run.status}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {run.totalExamples} examples
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>

                {run.status === 'completed' && (
                  <ConfusionMatrixDisplay calibration={run} />
                )}

                {run.status === 'failed' && (
                  <div className="text-sm text-red-400">
                    {(() => {
                      try {
                        const metrics = JSON.parse(run.metricsJson)
                        return metrics.error || 'Calibration failed'
                      } catch {
                        return 'Calibration failed'
                      }
                    })()}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ConfusionMatrixDisplay({ calibration }: { calibration: CalibrationRun }) {
  const tp = calibration.truePositives
  const tn = calibration.trueNegatives
  const fp = calibration.falsePositives
  const fn = calibration.falseNegatives
  const total = tp + tn + fp + fn

  let metricsData: { tpr?: number; tnr?: number; f1?: number; predictions?: Array<{ exampleId: string; expectedLabel: string; predictedLabel: string; evidence: string; correct: boolean }> } = {}
  try {
    metricsData = JSON.parse(calibration.metricsJson)
  } catch {
    // ignore
  }

  return (
    <div className="space-y-4">
      {/* Confusion Matrix */}
      <div className="border border-border rounded-lg p-4">
        <h4 className="font-medium mb-3">Confusion Matrix</h4>
        <div className="grid grid-cols-3 gap-1 max-w-xs text-center text-sm">
          <div></div>
          <div className="text-muted-foreground font-medium p-2">Predicted Pass</div>
          <div className="text-muted-foreground font-medium p-2">Predicted Fail</div>
          <div className="text-muted-foreground font-medium p-2 text-right">Actual Pass</div>
          <div className="bg-green-500/10 border border-green-500/20 rounded p-2 font-mono">
            TP: {tp}
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded p-2 font-mono">
            FN: {fn}
          </div>
          <div className="text-muted-foreground font-medium p-2 text-right">Actual Fail</div>
          <div className="bg-red-500/10 border border-red-500/20 rounded p-2 font-mono">
            FP: {fp}
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded p-2 font-mono">
            TN: {tn}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Precision</p>
          <p className="text-xl font-bold mt-1">
            {calibration.precision != null ? `${Math.round(calibration.precision * 100)}%` : '—'}
          </p>
        </div>
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Recall</p>
          <p className="text-xl font-bold mt-1">
            {calibration.recall != null ? `${Math.round(calibration.recall * 100)}%` : '—'}
          </p>
        </div>
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Agreement Rate</p>
          <p className="text-xl font-bold mt-1">
            {calibration.agreementRate != null ? `${Math.round(calibration.agreementRate * 100)}%` : '—'}
          </p>
        </div>
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">TPR (Sensitivity)</p>
          <p className="text-xl font-bold mt-1">
            {metricsData.tpr != null ? `${Math.round(metricsData.tpr * 100)}%` : '—'}
          </p>
        </div>
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">TNR (Specificity)</p>
          <p className="text-xl font-bold mt-1">
            {metricsData.tnr != null ? `${Math.round(metricsData.tnr * 100)}%` : '—'}
          </p>
        </div>
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">F1 Score</p>
          <p className="text-xl font-bold mt-1">
            {metricsData.f1 != null ? `${Math.round(metricsData.f1 * 100)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Per-example predictions */}
      {metricsData.predictions && metricsData.predictions.length > 0 && (
        <div className="border border-border rounded-lg p-4">
          <h4 className="font-medium mb-3">Per-Example Results</h4>
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {metricsData.predictions.map((pred, i) => (
              <div key={i} className="flex items-center gap-3 text-sm p-2 bg-secondary/30 rounded">
                {pred.correct ? (
                  <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                )}
                <span className="text-muted-foreground">Expected: {pred.expectedLabel}</span>
                <span className="text-muted-foreground">Predicted: {pred.predictedLabel}</span>
                <span className="text-muted-foreground truncate flex-1">{pred.evidence}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
