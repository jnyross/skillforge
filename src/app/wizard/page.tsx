'use client'

import { useState } from 'react'
import { Wand2, ArrowRight, ArrowLeft, Plus, X, Loader2, AlertTriangle, Check, FileText, TestTube, Sparkles } from 'lucide-react'

type WizardMode = 'extract' | 'synthesize' | 'hybrid' | 'scratch'
type WizardStep = 'mode' | 'intake' | 'generating' | 'review' | 'saving' | 'saved'

interface Artifact {
  name: string
  type: string
  content: string
}

interface GeneratedResult {
  skillMd: string
  files: Array<{ path: string; content: string }>
  triggerSuite: {
    name: string
    type: string
    cases: Array<{ key: string; name: string; prompt: string; shouldTrigger?: boolean; split: string }>
  }
  outputSuite: {
    name: string
    type: string
    cases: Array<{ key: string; name: string; prompt: string; expectedOutcome?: string; assertionType?: string; assertionValue?: string; split: string }>
  }
  smokePlan: string
  warnings: string[]
}

interface SaveResult {
  repo: { id: string; slug: string; displayName: string; description: string }
  version: { id: string; commitSha: string }
  suites: Array<{ id: string; name: string; type: string; caseCount: number }>
}

const ARTIFACT_TYPES = [
  { value: 'doc', label: 'Documentation' },
  { value: 'runbook', label: 'Runbook' },
  { value: 'style-guide', label: 'Style Guide' },
  { value: 'api-schema', label: 'API / Schema' },
  { value: 'config', label: 'Config File' },
  { value: 'code', label: 'Code Sample' },
  { value: 'example-output', label: 'Example Output' },
  { value: 'failure-case', label: 'Failure Case' },
  { value: 'review-notes', label: 'Review Notes' },
  { value: 'other', label: 'Other' },
]

const MODE_INFO: Record<WizardMode, { title: string; description: string; icon: React.ReactNode }> = {
  extract: {
    title: 'Extract from Task',
    description: 'Turn a successful hands-on Claude task into a reusable skill. Provide conversation transcripts, code outputs, and corrections.',
    icon: <FileText className="h-6 w-6" />,
  },
  synthesize: {
    title: 'Synthesize from Artifacts',
    description: 'Build a skill from existing docs, runbooks, style guides, APIs, schemas, and example outputs.',
    icon: <Sparkles className="h-6 w-6" />,
  },
  hybrid: {
    title: 'Hybrid',
    description: 'Combine task extraction with artifact synthesis for the most grounded result.',
    icon: <TestTube className="h-6 w-6" />,
  },
  scratch: {
    title: 'From Scratch',
    description: 'Describe your intent and let the wizard generate an initial skill draft with evals and benchmarks.',
    icon: <Wand2 className="h-6 w-6" />,
  },
}

export default function WizardPage() {
  const [step, setStep] = useState<WizardStep>('mode')
  const [mode, setMode] = useState<WizardMode | null>(null)
  const [intent, setIntent] = useState('')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [corrections, setCorrections] = useState('')
  const [desiredOutputFormat, setDesiredOutputFormat] = useState('')
  const [safetyConstraints, setSafetyConstraints] = useState('')
  const [allowedTools, setAllowedTools] = useState('')

  // PR 1: Concrete examples and freedom level
  const [concreteExamples, setConcreteExamples] = useState<string[]>([])
  const [newExample, setNewExample] = useState('')
  const [freedomLevel, setFreedomLevel] = useState<'high' | 'medium' | 'low'>('medium')

  // Quality metrics for review step
  const [lintResults, setLintResults] = useState<{ errors: number; warnings: number; infos: number; details: Array<{ severity: string; message: string }> } | null>(null)

  // New artifact form
  const [showArtifactForm, setShowArtifactForm] = useState(false)
  const [newArtifactName, setNewArtifactName] = useState('')
  const [newArtifactType, setNewArtifactType] = useState('doc')
  const [newArtifactContent, setNewArtifactContent] = useState('')

  // Generation state
  const [draftId, setDraftId] = useState<string | null>(null)
  const [generated, setGenerated] = useState<GeneratedResult | null>(null)
  const [error, setError] = useState('')

  // Review state — allow editing the generated skill
  const [editedSkillMd, setEditedSkillMd] = useState('')
  const [repoName, setRepoName] = useState('')

  // Save state
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null)

  // Smoke auto-run state
  const [smokeRunning, setSmokeRunning] = useState(false)
  const [smokeResult, setSmokeResult] = useState<{ runId: string; status: string; passRate?: number } | null>(null)

  // Draft history
  const [drafts, setDrafts] = useState<Array<{ id: string; intent: string; mode: string; status: string; createdAt: string }>>([])
  const [showDrafts, setShowDrafts] = useState(false)

  const addArtifact = () => {
    if (!newArtifactName.trim() || !newArtifactContent.trim()) return
    setArtifacts(prev => [...prev, {
      name: newArtifactName.trim(),
      type: newArtifactType,
      content: newArtifactContent.trim(),
    }])
    setNewArtifactName('')
    setNewArtifactType('doc')
    setNewArtifactContent('')
    setShowArtifactForm(false)
  }

  const removeArtifact = (index: number) => {
    setArtifacts(prev => prev.filter((_, i) => i !== index))
  }

  const handleGenerate = async () => {
    if (!intent.trim()) return
    setError('')
    setStep('generating')

    try {
      // 1. Create or update draft
      let currentDraftId = draftId

      const draftPayload = {
        intent: intent.trim(),
        artifactsJson: artifacts,
        mode: mode || 'scratch',
        concreteExamples: JSON.stringify(concreteExamples.filter(Boolean)),
        freedomLevel,
        configJson: JSON.stringify({
          ...(corrections.trim() ? { corrections: corrections.trim().split('\n').filter(Boolean) } : {}),
          ...(desiredOutputFormat.trim() ? { desiredOutputFormat: desiredOutputFormat.trim() } : {}),
          ...(safetyConstraints.trim() ? { safetyConstraints: safetyConstraints.trim() } : {}),
          ...(allowedTools.trim() ? { allowedTools: allowedTools.split(',').map((t: string) => t.trim()).filter(Boolean) } : {}),
        }),
      }

      if (currentDraftId) {
        // Update existing draft with current UI state before re-generating
        const patchRes = await fetch(`/api/wizard/draft/${currentDraftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftPayload),
        })
        if (!patchRes.ok) throw new Error('Failed to update draft')
      } else {
        const draftRes = await fetch('/api/wizard/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...draftPayload,
            corrections: corrections.trim() ? corrections.trim().split('\n').filter(Boolean) : [],
            desiredOutputFormat: desiredOutputFormat.trim() || undefined,
            safetyConstraints: safetyConstraints.trim() || undefined,
            allowedTools: allowedTools.trim() ? allowedTools.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
          }),
        })
        if (!draftRes.ok) throw new Error('Failed to create draft')
        const draft = await draftRes.json()
        currentDraftId = draft.id
        setDraftId(draft.id)
      }

      // 2. Generate skill
      const genRes = await fetch(`/api/wizard/draft/${currentDraftId}/generate`, {
        method: 'POST',
      })
      if (!genRes.ok) {
        const errData = await genRes.json()
        throw new Error(errData.error || 'Generation failed')
      }
      const genData = await genRes.json()
      setGenerated(genData.generated)
      setEditedSkillMd(genData.generated.skillMd)

      // Extract name from generated skill for repo name suggestion
      const nameMatch = genData.generated.skillMd.match(/^name:\s*(.+)$/m)
      if (nameMatch) {
        setRepoName(nameMatch[1].trim().replace(/^["']|["']$/g, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()))
      }

      // Run lint on generated skill
      try {
        const lintRes = await fetch('/api/skill-repos/lint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: genData.generated.skillMd }),
        })
        if (lintRes.ok) {
          const lintData = await lintRes.json()
          setLintResults({
            errors: lintData.errorCount ?? 0,
            warnings: lintData.warningCount ?? 0,
            infos: lintData.infoCount ?? 0,
            details: (lintData.results ?? []).slice(0, 10).map((r: { severity: string; message: string }) => ({ severity: r.severity, message: r.message })),
          })
        }
      } catch {
        // lint is optional, don't block
      }

      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStep('intake')
    }
  }

  const handleSave = async () => {
    if (!draftId) return
    setError('')
    setStep('saving')

    try {
      const res = await fetch(`/api/wizard/draft/${draftId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillMd: editedSkillMd,
          repoName: repoName || undefined,
        }),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Save failed')
      }
      const result = await res.json()
      setSaveResult(result)
      setStep('saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setStep('review')
    }
  }

  const handleSmokeRun = async () => {
    if (!saveResult || saveResult.suites.length === 0) return
    setSmokeRunning(true)
    try {
      // Create an eval run using the first suite (trigger suite)
      const suite = saveResult.suites[0]
      const res = await fetch('/api/eval-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillRepoId: saveResult.repo.id,
          skillVersionId: saveResult.version.id,
          suiteId: suite.id,
          executorType: 'claude-cli',
          splitFilter: 'train',
        }),
      })
      if (!res.ok) throw new Error('Failed to create smoke run')
      const run = await res.json()

      // Start the run
      await fetch(`/api/eval-runs/${run.id}/start`, { method: 'POST' })

      // Poll for completion (max 3 min for real Claude CLI calls)
      let status = 'running'
      let passRate: number | undefined
      for (let i = 0; i < 90; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        const pollRes = await fetch(`/api/eval-runs/${run.id}`)
        if (!pollRes.ok) break
        const pollData = await pollRes.json()
        status = pollData.status
        if (status === 'completed' || status === 'failed') {
          try {
            const metrics = JSON.parse(pollData.metricsJson || '{}')
            passRate = metrics.passRate
          } catch { /* ignore */ }
          break
        }
      }
      setSmokeResult({ runId: run.id, status, passRate })
    } catch {
      setSmokeResult({ runId: '', status: 'error' })
    }
    setSmokeRunning(false)
  }

  const handleStartOver = () => {
    setStep('mode')
    setMode(null)
    setIntent('')
    setArtifacts([])
    setCorrections('')
    setDesiredOutputFormat('')
    setSafetyConstraints('')
    setAllowedTools('')
    setConcreteExamples([])
    setNewExample('')
    setFreedomLevel('medium')
    setLintResults(null)
    setDraftId(null)
    setGenerated(null)
    setEditedSkillMd('')
    setRepoName('')
    setSaveResult(null)
    setError('')
  }

  const loadDrafts = async () => {
    try {
      const res = await fetch('/api/wizard/draft')
      const data = await res.json()
      setDrafts(data)
      setShowDrafts(true)
    } catch {
      // ignore
    }
  }

  const resumeDraft = async (draft: { id: string; intent: string; mode: string; status: string }) => {
    setDraftId(draft.id)
    setIntent(draft.intent)
    setShowDrafts(false)

    const draftMode = (['extract', 'synthesize', 'hybrid', 'scratch'].includes(draft.mode)
      ? draft.mode
      : 'scratch') as WizardMode

    if (draft.status === 'review') {
      // Load the generated data
      try {
        const res = await fetch(`/api/wizard/draft/${draft.id}`)
        const data = await res.json()
        const evals = JSON.parse(data.generatedEvals || '{}')
        setGenerated({
          skillMd: data.generatedSkill,
          files: evals.files || [],
          triggerSuite: evals.triggerSuite || { name: '', type: 'trigger', cases: [] },
          outputSuite: evals.outputSuite || { name: '', type: 'output', cases: [] },
          smokePlan: evals.smokePlan || '',
          warnings: evals.warnings || [],
        })
        setEditedSkillMd(data.generatedSkill)
        // Also restore concreteExamples and freedomLevel so "Back to Edit" has them
        try {
          const examples = JSON.parse(data.concreteExamples || '[]')
          if (Array.isArray(examples) && examples.length > 0) setConcreteExamples(examples)
        } catch { /* ignore */ }
        if (typeof data.freedomLevel === 'string' && data.freedomLevel) {
          setFreedomLevel(data.freedomLevel as 'high' | 'medium' | 'low')
        }
        // Restore artifacts and config for "Back to Edit"
        const arts = JSON.parse(data.artifactsJson || '[]')
        if (Array.isArray(arts) && arts.length > 0) setArtifacts(arts)
        const config = JSON.parse(data.configJson || '{}')
        if (Array.isArray(config.corrections) && config.corrections.length > 0) {
          setCorrections(config.corrections.join('\n'))
        }
        if (typeof config.desiredOutputFormat === 'string') setDesiredOutputFormat(config.desiredOutputFormat)
        if (typeof config.safetyConstraints === 'string') setSafetyConstraints(config.safetyConstraints)
        if (Array.isArray(config.allowedTools) && config.allowedTools.length > 0) {
          setAllowedTools(config.allowedTools.join(', '))
        }
        setMode(draftMode)
        setStep('review')
      } catch {
        setStep('intake')
        setMode(draftMode)
      }
    } else {
      // Load full draft data for intake drafts (artifacts, config)
      try {
        const res = await fetch(`/api/wizard/draft/${draft.id}`)
        const data = await res.json()
        const arts = JSON.parse(data.artifactsJson || '[]')
        if (Array.isArray(arts) && arts.length > 0) setArtifacts(arts)
        const config = JSON.parse(data.configJson || '{}')
        if (Array.isArray(config.corrections) && config.corrections.length > 0) {
          setCorrections(config.corrections.join('\n'))
        }
        if (typeof config.desiredOutputFormat === 'string') setDesiredOutputFormat(config.desiredOutputFormat)
        if (typeof config.safetyConstraints === 'string') setSafetyConstraints(config.safetyConstraints)
        if (Array.isArray(config.allowedTools) && config.allowedTools.length > 0) {
          setAllowedTools(config.allowedTools.join(', '))
        }
        // concreteExamples and freedomLevel are top-level columns, not inside configJson
        try {
          const examples = JSON.parse(data.concreteExamples || '[]')
          if (Array.isArray(examples) && examples.length > 0) setConcreteExamples(examples)
        } catch { /* ignore */ }
        if (typeof data.freedomLevel === 'string' && data.freedomLevel) {
          setFreedomLevel(data.freedomLevel as 'high' | 'medium' | 'low')
        }
      } catch {
        // ignore — proceed with just intent and mode
      }
      setStep('intake')
      setMode(draftMode)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="h-6 w-6" />
            Skill Creation Wizard
          </h1>
          <p className="text-muted-foreground mt-1">
            Create new skills from artifacts, conversations, and intent descriptions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDrafts}
            className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
          >
            Drafts
          </button>
          {step !== 'mode' && (
            <button
              onClick={handleStartOver}
              className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
            >
              Start Over
            </button>
          )}
        </div>
      </div>

      {/* Progress indicator */}
      {step !== 'mode' && (
        <div className="flex items-center gap-2 text-sm">
          {(['mode', 'intake', 'generating', 'review', 'saved'] as const).map((s, i) => {
            const labels = { mode: 'Mode', intake: 'Input', generating: 'Generate', review: 'Review', saved: 'Saved' }
            const currentIdx = ['mode', 'intake', 'generating', 'review', 'saved'].indexOf(step === 'saving' ? 'review' : step)
            const isActive = i <= currentIdx
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-8 ${isActive ? 'bg-primary' : 'bg-border'}`} />}
                <div className={`flex items-center gap-1 ${isActive ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs ${isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                    {i + 1}
                  </div>
                  {labels[s]}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-400 font-medium">Error</p>
            <p className="text-sm text-red-400/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Drafts dialog */}
      {showDrafts && (
        <div className="border border-border rounded-lg p-6 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Saved Drafts</h3>
            <button onClick={() => setShowDrafts(false)} className="p-1 hover:bg-accent rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drafts found.</p>
          ) : (
            <div className="space-y-2">
              {drafts.map(d => (
                <div key={d.id} className="flex items-center justify-between border border-border rounded p-3 hover:bg-accent/50">
                  <div>
                    <p className="text-sm font-medium">{d.intent.slice(0, 80) || '(no intent)'}{d.intent.length > 80 ? '...' : ''}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.status} — {new Date(d.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {(d.status === 'intake' || d.status === 'review') && (
                    <button
                      onClick={() => resumeDraft(d)}
                      className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                    >
                      Resume
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Mode Selection */}
      {step === 'mode' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.entries(MODE_INFO) as [WizardMode, typeof MODE_INFO[WizardMode]][]).map(([key, info]) => (
            <button
              key={key}
              onClick={() => { setMode(key); setStep('intake') }}
              className="border border-border rounded-lg p-6 hover:bg-accent transition-colors text-left group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  {info.icon}
                </div>
                <h3 className="text-lg font-medium">{info.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{info.description}</p>
              <div className="flex items-center gap-2 text-primary text-sm group-hover:gap-3 transition-all">
                Start <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Intake */}
      {step === 'intake' && mode && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button onClick={() => setStep('mode')} className="hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
            <span>·</span>
            <span>Mode: {MODE_INFO[mode].title}</span>
          </div>

          {/* Intent */}
          <div>
            <label className="block text-sm font-medium mb-2">
              What should this skill do? *
            </label>
            <textarea
              value={intent}
              onChange={e => setIntent(e.target.value)}
              placeholder="Describe what you want the skill to accomplish. Be specific about the trigger conditions, the steps involved, and the expected output..."
              rows={4}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm resize-y"
            />
          </div>

          {/* Concrete Examples (Step 1 of Skill Creator methodology) */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Concrete Usage Examples
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Provide 3-5 real scenarios where this skill would be used. These ground the skill in practical use cases.
            </p>
            {concreteExamples.map((ex, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                <input
                  value={ex}
                  onChange={e => {
                    const updated = [...concreteExamples]
                    updated[i] = e.target.value
                    setConcreteExamples(updated)
                  }}
                  className="flex-1 px-2 py-1.5 bg-background border border-border rounded text-sm"
                />
                <button onClick={() => setConcreteExamples(prev => prev.filter((_, j) => j !== i))} className="p-1 hover:bg-accent rounded">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                value={newExample}
                onChange={e => setNewExample(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newExample.trim()) {
                    setConcreteExamples(prev => [...prev, newExample.trim()])
                    setNewExample('')
                  }
                }}
                placeholder="Type a usage example and press Enter..."
                className="flex-1 px-2 py-1.5 bg-background border border-border rounded text-sm"
              />
              <button
                onClick={() => {
                  if (newExample.trim()) {
                    setConcreteExamples(prev => [...prev, newExample.trim()])
                    setNewExample('')
                  }
                }}
                disabled={!newExample.trim()}
                className="flex items-center gap-1 px-2 py-1.5 text-xs border border-border rounded hover:bg-accent disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          </div>

          {/* Freedom Level (Degrees of Freedom) */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Specificity Level
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              How much freedom should the agent have when following this skill?
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(['high', 'medium', 'low'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => setFreedomLevel(level)}
                  className={`border rounded-lg p-3 text-left transition-colors ${
                    freedomLevel === level
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent/50'
                  }`}
                >
                  <p className="text-sm font-medium capitalize">{level} Freedom</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {level === 'high' && 'Text instructions, multiple valid approaches'}
                    {level === 'medium' && 'Pseudocode, parameterized steps'}
                    {level === 'low' && 'Exact scripts, minimal flexibility'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Artifacts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">
                Artifacts {mode !== 'scratch' ? '*' : '(optional)'}
              </label>
              <button
                onClick={() => setShowArtifactForm(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-accent"
              >
                <Plus className="h-3 w-3" /> Add Artifact
              </button>
            </div>

            {artifacts.length > 0 && (
              <div className="space-y-2 mb-3">
                {artifacts.map((a, i) => (
                  <div key={i} className="flex items-center justify-between border border-border rounded p-3">
                    <div>
                      <span className="text-sm font-medium">{a.name}</span>
                      <span className="ml-2 text-xs bg-secondary px-1.5 py-0.5 rounded">{a.type}</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {a.content.length} chars
                      </p>
                    </div>
                    <button onClick={() => removeArtifact(i)} className="p-1 hover:bg-accent rounded">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {artifacts.length === 0 && mode !== 'scratch' && (
              <p className="text-sm text-muted-foreground mb-3">
                Add documentation, runbooks, APIs, code samples, or example outputs to ground the generated skill.
              </p>
            )}

            {/* Add artifact form */}
            {showArtifactForm && (
              <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Add Artifact</h4>
                  <button onClick={() => setShowArtifactForm(false)} className="p-1 hover:bg-accent rounded">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Name</label>
                    <input
                      value={newArtifactName}
                      onChange={e => setNewArtifactName(e.target.value)}
                      placeholder="e.g., API Reference"
                      className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Type</label>
                    <select
                      value={newArtifactType}
                      onChange={e => setNewArtifactType(e.target.value)}
                      className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm"
                    >
                      {ARTIFACT_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Content</label>
                  <textarea
                    value={newArtifactContent}
                    onChange={e => setNewArtifactContent(e.target.value)}
                    placeholder="Paste the artifact content here..."
                    rows={6}
                    className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm font-mono resize-y"
                  />
                </div>
                <button
                  onClick={addArtifact}
                  disabled={!newArtifactName.trim() || !newArtifactContent.trim()}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Additional fields */}
          <div className="space-y-4">
            <details className="border border-border rounded-lg">
              <summary className="px-4 py-3 text-sm font-medium cursor-pointer hover:bg-accent/50 rounded-lg">
                Advanced Options
              </summary>
              <div className="px-4 pb-4 space-y-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Corrections / Gotchas (one per line)
                  </label>
                  <textarea
                    value={corrections}
                    onChange={e => setCorrections(e.target.value)}
                    placeholder="Things that commonly go wrong or need special handling..."
                    rows={3}
                    className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Desired Output Format
                  </label>
                  <textarea
                    value={desiredOutputFormat}
                    onChange={e => setDesiredOutputFormat(e.target.value)}
                    placeholder="Describe the expected output format (e.g., markdown with code blocks, JSON, etc.)..."
                    rows={2}
                    className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Safety Constraints
                  </label>
                  <textarea
                    value={safetyConstraints}
                    onChange={e => setSafetyConstraints(e.target.value)}
                    placeholder="Any restrictions on what the skill should NOT do..."
                    rows={2}
                    className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Allowed Tools (comma-separated)
                  </label>
                  <input
                    value={allowedTools}
                    onChange={e => setAllowedTools(e.target.value)}
                    placeholder="e.g., Read, Write, Bash, Browser"
                    className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm"
                  />
                </div>
              </div>
            </details>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!intent.trim() || (mode !== 'scratch' && artifacts.length === 0)}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Generate Skill
          </button>
        </div>
      )}

      {/* Step 3: Generating */}
      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg font-medium">Generating your skill...</p>
          <p className="text-sm text-muted-foreground">
            Analyzing intent and artifacts to create SKILL.md, eval suites, and benchmark plan.
          </p>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 'review' && generated && (
        <div className="space-y-6">
          {/* Warnings */}
          {generated.warnings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">Warnings</span>
              </div>
              <ul className="text-sm text-amber-400/80 space-y-1">
                {generated.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Quality Metrics Panel */}
          <div className="grid grid-cols-4 gap-3">
            <div className="border border-border rounded-lg p-3 bg-card">
              <p className="text-xs text-muted-foreground">Description Words</p>
              <p className="text-lg font-bold">
                {(() => {
                  const descMatch = editedSkillMd.match(/^description:\s*(.+)$/m)
                  const wordCount = descMatch ? descMatch[1].split(/\s+/).filter(Boolean).length : 0
                  return wordCount
                })()}
              </p>
              <p className="text-xs text-muted-foreground">Target: ≤100</p>
            </div>
            <div className="border border-border rounded-lg p-3 bg-card">
              <p className="text-xs text-muted-foreground">Body Lines</p>
              <p className="text-lg font-bold">{editedSkillMd.split('\n').length}</p>
              <p className="text-xs text-muted-foreground">Target: &lt;500</p>
            </div>
            <div className="border border-border rounded-lg p-3 bg-card">
              <p className="text-xs text-muted-foreground">Reference Files</p>
              <p className="text-lg font-bold">{generated.files.length}</p>
            </div>
            <div className="border border-border rounded-lg p-3 bg-card">
              <p className="text-xs text-muted-foreground">Lint</p>
              {lintResults ? (
                <>
                  <p className={`text-lg font-bold ${lintResults.errors > 0 ? 'text-red-400' : lintResults.warnings > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                    {lintResults.errors > 0 ? `${lintResults.errors} errors` : lintResults.warnings > 0 ? `${lintResults.warnings} warns` : 'Clean'}
                  </p>
                  {lintResults.details.length > 0 && (
                    <details className="mt-1">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Details</summary>
                      <ul className="text-xs mt-1 space-y-0.5">
                        {lintResults.details.map((d, i) => (
                          <li key={i} className={d.severity === 'error' ? 'text-red-400' : d.severity === 'warning' ? 'text-amber-400' : 'text-muted-foreground'}>
                            [{d.severity}] {d.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">N/A</p>
              )}
            </div>
          </div>

          {/* Generated SKILL.md — editable */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Generated SKILL.md</h3>
              <span className="text-xs text-muted-foreground">You can edit before saving</span>
            </div>
            <textarea
              value={editedSkillMd}
              onChange={e => setEditedSkillMd(e.target.value)}
              rows={16}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono resize-y"
            />
          </div>

          {/* Generated files */}
          {generated.files.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Generated Files</h3>
              <div className="space-y-2">
                {generated.files.map((f, i) => (
                  <details key={i} className="border border-border rounded-lg">
                    <summary className="px-3 py-2 text-sm cursor-pointer hover:bg-accent/50">
                      <span className="font-mono">{f.path}</span>
                    </summary>
                    <pre className="px-3 pb-3 text-xs font-mono overflow-x-auto text-muted-foreground">
                      {f.content}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Trigger Suite */}
          <div>
            <h3 className="text-sm font-medium mb-2">
              Trigger Eval Suite ({generated.triggerSuite.cases.length} cases)
            </h3>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Should Trigger</th>
                    <th className="px-3 py-2 text-left font-medium">Split</th>
                  </tr>
                </thead>
                <tbody>
                  {generated.triggerSuite.cases.map((c, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{c.name}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${c.shouldTrigger ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                          {c.shouldTrigger ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{c.split}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Output Suite */}
          <div>
            <h3 className="text-sm font-medium mb-2">
              Output Eval Suite ({generated.outputSuite.cases.length} cases)
            </h3>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Assertion</th>
                    <th className="px-3 py-2 text-left font-medium">Split</th>
                  </tr>
                </thead>
                <tbody>
                  {generated.outputSuite.cases.map((c, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{c.name}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                        {c.assertionType ? `${c.assertionType}: "${c.assertionValue}"` : '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{c.split}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Smoke Plan */}
          <div>
            <h3 className="text-sm font-medium mb-2">Smoke Benchmark Plan</h3>
            <div className="border border-border rounded-lg p-3 text-sm text-muted-foreground whitespace-pre-wrap">
              {generated.smokePlan}
            </div>
          </div>

          {/* Repo name override */}
          <div>
            <label className="block text-sm font-medium mb-1">Skill Repository Name</label>
            <input
              value={repoName}
              onChange={e => setRepoName(e.target.value)}
              placeholder="Auto-generated from skill name"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
            />
          </div>

          {/* Save buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep('intake')}
              className="px-4 py-2.5 border border-border rounded-md text-sm hover:bg-accent flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Edit
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
            >
              <Check className="h-4 w-4" />
              Save Skill + Create Eval Suites
            </button>
          </div>
        </div>
      )}

      {/* Saving state */}
      {step === 'saving' && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg font-medium">Saving skill...</p>
          <p className="text-sm text-muted-foreground">
            Creating git repo, initial version, and eval suites.
          </p>
        </div>
      )}

      {/* Step 5: Saved */}
      {step === 'saved' && saveResult && (
        <div className="border border-green-500/20 bg-green-500/5 rounded-lg p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-400" />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">Skill Created Successfully!</h2>
            <p className="text-muted-foreground">
              {saveResult.repo.displayName} has been created with an initial version and eval suites.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="border border-border rounded-lg p-4 bg-card">
              <p className="text-muted-foreground mb-1">Repository</p>
              <p className="font-medium">{saveResult.repo.displayName}</p>
            </div>
            <div className="border border-border rounded-lg p-4 bg-card">
              <p className="text-muted-foreground mb-1">Version</p>
              <p className="font-mono text-xs">{saveResult.version.commitSha.slice(0, 7)}</p>
            </div>
            <div className="border border-border rounded-lg p-4 bg-card">
              <p className="text-muted-foreground mb-1">Eval Suites</p>
              <p className="font-medium">{saveResult.suites.length} suites</p>
              <p className="text-xs text-muted-foreground mt-1">
                {saveResult.suites.map(s => `${s.name} (${s.caseCount} cases)`).join(', ')}
              </p>
            </div>
          </div>

          {/* Smoke auto-run */}
          <div className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-sm">Smoke Eval Run</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Auto-run the first eval suite with Claude CLI to verify eval pipeline works
                </p>
              </div>
              {!smokeResult && (
                <button
                  onClick={handleSmokeRun}
                  disabled={smokeRunning}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {smokeRunning ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
                  ) : (
                    <><TestTube className="h-4 w-4" /> Run Smoke Eval</>
                  )}
                </button>
              )}
            </div>
            {smokeResult && (
              <div className={`mt-3 p-3 rounded text-sm ${
                smokeResult.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                smokeResult.status === 'error' ? 'bg-red-500/10 text-red-400' :
                'bg-yellow-500/10 text-yellow-400'
              }`}>
                {smokeResult.status === 'completed' ? (
                  <>Smoke run completed. Pass rate: {smokeResult.passRate !== undefined ? `${Math.round(smokeResult.passRate * 100)}%` : 'N/A'}.{' '}
                    <a href={`/evals/runs/${smokeResult.runId}`} className="underline">View run</a>
                  </>
                ) : smokeResult.status === 'error' ? (
                  'Smoke run failed to start. You can run evals manually from the Evals page.'
                ) : (
                  <>Smoke run status: {smokeResult.status}.{' '}
                    {smokeResult.runId && <a href={`/evals/runs/${smokeResult.runId}`} className="underline">View run</a>}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            <a
              href={`/skill-repos/${saveResult.repo.id}`}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
            >
              View Skill Repo
            </a>
            <a
              href="/evals"
              className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent"
            >
              View Eval Suites
            </a>
            <button
              onClick={handleStartOver}
              className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent"
            >
              Create Another
            </button>
          </div>
        </div>
      )}

      {/* Outputs reference */}
      {step === 'mode' && (
        <div className="text-sm text-muted-foreground border border-border rounded-lg p-4">
          <p className="font-medium mb-1">What the wizard produces:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Valid SKILL.md with YAML frontmatter</li>
            <li>Recommended references/, scripts/, and assets/</li>
            <li>Trigger eval suite + output eval suite</li>
            <li>Baseline assertions and initial judge prompts</li>
            <li>First-run smoke benchmark plan</li>
          </ul>
        </div>
      )}
    </div>
  )
}
