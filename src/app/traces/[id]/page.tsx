'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Activity, CheckCircle, XCircle, FileText,
  Terminal, Clock, Cpu, ArrowUpRight
} from 'lucide-react'

interface TraceDetail {
  id: string
  sessionId: string
  model: string
  prompt: string
  totalDurationMs: number | null
  totalCostUsd: number | null
  totalTokens: number | null
  inputTokens: number | null
  outputTokens: number | null
  status: string
  resultJson: string
  error: string | null
  createdAt: string
  completedAt: string | null
  evalRun: {
    id: string
    suite: { id: string; name: string; type: string }
    skillRepo: { id: string; displayName: string; slug: string }
  } | null
  skillVersion: {
    id: string
    commitMessage: string
    branchName: string
    createdAt: string
  } | null
  toolEvents: ToolEvent[]
  artifacts: Artifact[]
  logChunks: LogChunk[]
  caseRuns: CaseRunInfo[]
}

interface ToolEvent {
  id: string
  toolName: string
  input: string
  output: string
  durationMs: number | null
  sequence: number
}

interface Artifact {
  id: string
  name: string
  type: string
  path: string
  content: string
  sizeBytes: number
}

interface LogChunk {
  id: string
  stream: string
  content: string
  sequence: number
}

interface CaseRunInfo {
  id: string
  status: string
  evalCase: { id: string; name: string; key: string; prompt: string }
  assertions: Array<{
    id: string
    name: string
    type: string
    passed: boolean
    expected: string
    actual: string
    message: string
  }>
}

export default function TraceDetailPage() {
  const params = useParams()
  const traceId = params.id as string

  const [trace, setTrace] = useState<TraceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'timeline' | 'artifacts' | 'output' | 'assertions'>('timeline')
  const [promoting, setPromoting] = useState(false)
  const [promoted, setPromoted] = useState(false)

  useEffect(() => {
    fetch(`/api/traces/${traceId}`)
      .then(r => r.json())
      .then(data => { setTrace(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [traceId])

  const promoteToRegression = async () => {
    setPromoting(true)
    const res = await fetch(`/api/traces/${traceId}/promote`, { method: 'POST' })
    if (res.ok) setPromoted(true)
    setPromoting(false)
  }

  if (loading || !trace) {
    return <div className="p-6 text-muted-foreground">Loading...</div>
  }

  const result = (() => { try { return JSON.parse(trace.resultJson) } catch { return {} } })()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/traces" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ChevronLeft className="h-4 w-4" /> Back to Traces
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Trace</h1>
            <span className="text-sm font-mono text-muted-foreground">{trace.id.slice(0, 12)}</span>
            <span className={`px-2 py-0.5 rounded text-xs ${trace.status === 'completed' ? 'bg-green-500/10 text-green-400' : trace.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
              {trace.status}
            </span>
          </div>
          <div className="flex gap-2">
            {trace.evalRun && (
              <Link href={`/evals/runs/${trace.evalRun.id}`} className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent">
                <ArrowUpRight className="h-3 w-3" /> View Run
              </Link>
            )}
            <button
              onClick={promoteToRegression}
              disabled={promoting || promoted}
              className="px-3 py-1.5 bg-orange-600 text-white rounded-md text-sm hover:bg-orange-700 disabled:opacity-50"
            >
              {promoted ? 'Promoted!' : promoting ? 'Promoting...' : 'Promote to Regression'}
            </button>
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Duration</p>
          <p className="font-medium">{trace.totalDurationMs != null ? `${(trace.totalDurationMs / 1000).toFixed(1)}s` : '-'}</p>
        </div>
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Cpu className="h-3 w-3" /> Model</p>
          <p className="font-medium text-sm">{trace.model || '-'}</p>
        </div>
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Tokens</p>
          <p className="font-medium">{trace.totalTokens ?? '-'}</p>
          {trace.inputTokens != null && (
            <p className="text-xs text-muted-foreground">{trace.inputTokens} in / {trace.outputTokens} out</p>
          )}
        </div>
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Cost</p>
          <p className="font-medium">{trace.totalCostUsd != null ? `$${trace.totalCostUsd.toFixed(4)}` : '-'}</p>
        </div>
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Context</p>
          {trace.evalRun ? (
            <p className="font-medium text-sm">{trace.evalRun.suite.name}</p>
          ) : (
            <p className="text-muted-foreground text-sm">-</p>
          )}
        </div>
      </div>

      {/* Case run assertions */}
      {trace.caseRuns.length > 0 && (
        <div className="border border-border rounded-lg p-4">
          <h3 className="font-medium mb-2">Related Case Runs</h3>
          {trace.caseRuns.map(cr => (
            <div key={cr.id} className="mb-3 last:mb-0">
              <div className="flex items-center gap-2">
                {cr.status === 'passed' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                <span className="font-medium">{cr.evalCase.name}</span>
                <span className="text-xs text-muted-foreground font-mono">{cr.evalCase.key}</span>
              </div>
              {cr.assertions.length > 0 && (
                <div className="ml-6 mt-1 space-y-1">
                  {cr.assertions.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      {a.passed ? <CheckCircle className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                      <span className="text-muted-foreground">{a.type}:</span>
                      <span>{a.message || (a.passed ? 'Passed' : 'Failed')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border">
        <button onClick={() => setTab('timeline')} className={`pb-2 text-sm font-medium border-b-2 ${tab === 'timeline' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Terminal className="h-4 w-4 inline mr-1" /> Tool Calls ({trace.toolEvents.length})
        </button>
        <button onClick={() => setTab('artifacts')} className={`pb-2 text-sm font-medium border-b-2 ${tab === 'artifacts' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <FileText className="h-4 w-4 inline mr-1" /> Artifacts ({trace.artifacts.length})
        </button>
        <button onClick={() => setTab('output')} className={`pb-2 text-sm font-medium border-b-2 ${tab === 'output' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          Output
        </button>
      </div>

      {/* Tool calls timeline */}
      {tab === 'timeline' && (
        <div className="space-y-3">
          {trace.toolEvents.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No tool events captured.</div>
          ) : (
            trace.toolEvents.map((event, i) => (
              <div key={event.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                    <span className="font-medium font-mono text-sm">{event.toolName}</span>
                    {event.durationMs != null && (
                      <span className="text-xs text-muted-foreground">{event.durationMs}ms</span>
                    )}
                  </div>
                </div>
                {event.input && (
                  <details className="mb-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">Input</summary>
                    <pre className="text-xs bg-black/30 p-2 rounded mt-1 overflow-auto max-h-40">{event.input}</pre>
                  </details>
                )}
                {event.output && (
                  <details>
                    <summary className="text-xs text-muted-foreground cursor-pointer">Output</summary>
                    <pre className="text-xs bg-black/30 p-2 rounded mt-1 overflow-auto max-h-40">{event.output}</pre>
                  </details>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Artifacts */}
      {tab === 'artifacts' && (
        <div className="space-y-3">
          {trace.artifacts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No artifacts captured.</div>
          ) : (
            trace.artifacts.map(artifact => (
              <div key={artifact.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium font-mono text-sm">{artifact.path || artifact.name}</span>
                    <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-secondary">{artifact.type}</span>
                    <span className="text-xs text-muted-foreground">{(artifact.sizeBytes / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
                <pre className="text-xs bg-black/30 p-3 rounded overflow-auto max-h-64">{artifact.content}</pre>
              </div>
            ))
          )}
        </div>
      )}

      {/* Output */}
      {tab === 'output' && (
        <div className="space-y-3">
          {trace.logChunks.length > 0 ? (
            trace.logChunks.map(chunk => (
              <div key={chunk.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-secondary">{chunk.stream}</span>
                  <span className="text-xs text-muted-foreground">Chunk #{chunk.sequence}</span>
                </div>
                <pre className="text-xs bg-black/30 p-3 rounded overflow-auto max-h-96 whitespace-pre-wrap">{chunk.content}</pre>
              </div>
            ))
          ) : result.result ? (
            <div className="border border-border rounded-lg p-4">
              <pre className="text-xs bg-black/30 p-3 rounded overflow-auto max-h-96 whitespace-pre-wrap">{result.result}</pre>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">No output captured.</div>
          )}
        </div>
      )}
    </div>
  )
}
