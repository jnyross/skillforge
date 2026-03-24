'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  MessageSquarePlus, Send, Loader2, Check, X, Pencil,
  Plus, FlaskConical, Save, Trash2, BookOpen,
} from 'lucide-react'

// --- Types ---

interface SkillRepo {
  id: string
  displayName: string
  slug: string
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: string
  createdAt: string
}

interface ProposedCase {
  id: string
  name: string
  prompt: string
  expectedOutcome: string
  type: 'trigger' | 'output'
  shouldTrigger?: boolean
  assertionType?: string
  assertionValue?: string
  split: 'train' | 'validation' | 'holdout'
  category: string
  status: 'proposed' | 'accepted' | 'rejected' | 'edited'
}

interface Session {
  id: string
  title: string
  phase: string
  status: string
  corpusText: string
  proposedCasesJson: string
  skillRepo: { id: string; displayName: string; slug: string } | null
  messages: Message[]
  createdAt: string
}

interface SessionSummary {
  id: string
  title: string
  phase: string
  status: string
  skillRepo: { id: string; displayName: string; slug: string } | null
  _count: { messages: number }
  updatedAt: string
}

// --- Main Component ---

export default function EvalBuilderPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [repos, setRepos] = useState<SkillRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [showCorpusArea, setShowCorpusArea] = useState(false)
  const [corpusText, setCorpusText] = useState('')
  const [showNewSession, setShowNewSession] = useState(false)
  const [newSessionRepo, setNewSessionRepo] = useState('')
  const [editingCase, setEditingCase] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ProposedCase>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load sessions and repos
  useEffect(() => {
    Promise.all([
      fetch('/api/eval-builder/sessions').then(r => r.json()),
      fetch('/api/skill-repos').then(r => r.json()),
    ]).then(([s, r]) => {
      setSessions(s)
      setRepos(r)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeSession?.messages])

  const loadSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/eval-builder/sessions/${id}`)
    if (res.ok) {
      const data = await res.json()
      setActiveSession(data)
    }
  }, [])

  const createSession = async () => {
    const res = await fetch('/api/eval-builder/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skillRepoId: newSessionRepo || undefined,
        title: repos.find(r => r.id === newSessionRepo)?.displayName || 'New Eval Session',
      }),
    })
    if (res.ok) {
      const session = await res.json()
      setShowNewSession(false)
      setNewSessionRepo('')
      await loadSession(session.id)
      // Refresh sessions list
      const listRes = await fetch('/api/eval-builder/sessions')
      if (listRes.ok) setSessions(await listRes.json())
    }
  }

  const deleteSession = async (id: string) => {
    await fetch(`/api/eval-builder/sessions/${id}`, { method: 'DELETE' })
    if (activeSession?.id === id) setActiveSession(null)
    const listRes = await fetch('/api/eval-builder/sessions')
    if (listRes.ok) setSessions(await listRes.json())
  }

  const sendMessage = async () => {
    if (!input.trim() || !activeSession || sending) return
    const message = input.trim()
    setInput('')
    setSending(true)
    setError('')

    // Optimistically add user message
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: message,
      metadata: '{}',
      createdAt: new Date().toISOString(),
    }
    setActiveSession(prev => prev ? {
      ...prev,
      messages: [...prev.messages, tempMsg],
    } : null)

    try {
      const res = await fetch(`/api/eval-builder/sessions/${activeSession.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send message')
      }

      // Reload full session to get updated messages and cases
      await loadSession(activeSession.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const sendCorpus = async () => {
    if (!corpusText.trim() || !activeSession) return
    const corpus = corpusText.trim()
    setShowCorpusArea(false)
    setCorpusText('')
    setSending(true)
    setError('')

    const msg = `Here's my knowledge corpus:\n\n${corpus}`

    // Optimistically add user message
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: msg,
      metadata: '{}',
      createdAt: new Date().toISOString(),
    }
    setActiveSession(prev => prev ? {
      ...prev,
      messages: [...prev.messages, tempMsg],
    } : null)

    try {
      // Update the corpus on the session first
      await fetch(`/api/eval-builder/sessions/${activeSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpusText: corpus }),
      })

      // Then send the chat message (sequential, no race condition)
      const res = await fetch(`/api/eval-builder/sessions/${activeSession.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to process corpus')
      }

      await loadSession(activeSession.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process corpus')
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const updateCase = async (caseId: string, action: 'accept' | 'reject' | 'edit', edits?: Partial<ProposedCase>) => {
    if (!activeSession) return
    try {
      const res = await fetch(`/api/eval-builder/sessions/${activeSession.id}/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, edits }),
      })
      if (res.ok) {
        const data = await res.json()
        setActiveSession(prev => prev ? {
          ...prev,
          proposedCasesJson: JSON.stringify(data.cases),
        } : null)
        setEditingCase(null)
        setEditForm({})
      }
    } catch {
      setError('Failed to update case')
    }
  }

  const acceptAllCases = async () => {
    const cases = getParsedCases()
    for (const c of cases) {
      if (c.status === 'proposed') {
        await updateCase(c.id, 'accept')
      }
    }
  }

  const commitCases = async () => {
    if (!activeSession) return
    setCommitting(true)
    setError('')
    try {
      const res = await fetch(`/api/eval-builder/sessions/${activeSession.id}/commit`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Commit failed')
      }
      const result = await res.json()
      await loadSession(activeSession.id)

      // Add a system message about the commit
      setActiveSession(prev => prev ? {
        ...prev,
        status: 'committed',
        messages: [...prev.messages, {
          id: `commit-${Date.now()}`,
          role: 'system',
          content: `Successfully committed ${result.caseCount} test cases to ${result.suiteIds.length} eval suite(s).`,
          metadata: JSON.stringify(result),
          createdAt: new Date().toISOString(),
        }],
      } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
    }
    setCommitting(false)
  }

  const getParsedCases = (): ProposedCase[] => {
    if (!activeSession) return []
    try {
      return JSON.parse(activeSession.proposedCasesJson || '[]')
    } catch {
      return []
    }
  }

  const cases = getParsedCases()
  const acceptedCount = cases.filter(c => c.status === 'accepted' || c.status === 'edited').length
  const proposedCount = cases.filter(c => c.status === 'proposed').length

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const phaseLabels: Record<string, string> = {
    understanding: 'Understanding your skill',
    corpus: 'Ingesting knowledge',
    analysis: 'Analyzing behaviors',
    generation: 'Generating test cases',
    refinement: 'Refining test cases',
    committed: 'Complete',
  }

  // --- Render ---

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar - Session List */}
      <div className="w-72 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="font-bold flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5" />
            Eval Builder
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            AI-guided eval creation
          </p>
        </div>

        <div className="p-2">
          <button
            onClick={() => setShowNewSession(!showNewSession)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Conversation
          </button>
        </div>

        {showNewSession && (
          <div className="p-2 mx-2 border border-border rounded-md bg-background space-y-2">
            <select
              value={newSessionRepo}
              onChange={e => setNewSessionRepo(e.target.value)}
              className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm"
            >
              <option value="">Select a skill repo (optional)</option>
              {repos.map(r => (
                <option key={r.id} value={r.id}>{r.displayName}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={createSession} className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90">
                Start
              </button>
              <button onClick={() => setShowNewSession(false)} className="px-3 py-1 border border-border rounded text-xs hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`group flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                activeSession?.id === s.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              onClick={() => loadSession(s.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.title || 'Untitled'}</div>
                <div className="text-xs opacity-60">
                  {s._count.messages} messages &middot; {s.phase}
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteSession(s.id) }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">
              No conversations yet.<br />Start one above.
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      {activeSession ? (
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
            <div>
              <h2 className="font-semibold">{activeSession.title || 'New Eval Session'}</h2>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {activeSession.skillRepo && (
                  <span>Repo: {activeSession.skillRepo.displayName}</span>
                )}
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {phaseLabels[activeSession.phase] || activeSession.phase}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {cases.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {acceptedCount} accepted / {cases.length} total
                </span>
              )}
              {acceptedCount > 0 && activeSession.status !== 'committed' && (
                <button
                  onClick={commitCases}
                  disabled={committing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Commit to Evals
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
            {activeSession.messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-lg px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : msg.role === 'system'
                    ? 'bg-green-600/10 text-green-400 border border-green-600/20'
                    : 'bg-card border border-border'
                }`}>
                  <div className="text-sm whitespace-pre-wrap">{renderMarkdown(msg.content)}</div>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-lg px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Proposed Cases Panel */}
          {cases.length > 0 && activeSession.status !== 'committed' && (
            <div className="border-t border-border bg-card">
              <div className="px-6 py-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FlaskConical className="h-4 w-4" />
                  Proposed Test Cases ({cases.length})
                </h3>
                <div className="flex gap-2">
                  {proposedCount > 0 && (
                    <button
                      onClick={acceptAllCases}
                      className="text-xs px-2 py-1 rounded bg-green-600/10 text-green-400 hover:bg-green-600/20"
                    >
                      Accept All ({proposedCount})
                    </button>
                  )}
                </div>
              </div>
              <div className="px-6 pb-3 max-h-64 overflow-auto space-y-2">
                {cases.filter(c => c.status !== 'rejected').map(c => (
                  <div
                    key={c.id}
                    className={`border rounded-md p-3 text-sm ${
                      c.status === 'accepted' || c.status === 'edited'
                        ? 'border-green-600/30 bg-green-600/5'
                        : 'border-border bg-background'
                    }`}
                  >
                    {editingCase === c.id ? (
                      /* Edit Mode */
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.name ?? c.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                          placeholder="Case name"
                        />
                        <textarea
                          value={editForm.prompt ?? c.prompt}
                          onChange={e => setEditForm(f => ({ ...f, prompt: e.target.value }))}
                          className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                          rows={2}
                          placeholder="Prompt"
                        />
                        <textarea
                          value={editForm.expectedOutcome ?? c.expectedOutcome}
                          onChange={e => setEditForm(f => ({ ...f, expectedOutcome: e.target.value }))}
                          className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                          rows={2}
                          placeholder="Expected outcome"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateCase(c.id, 'edit', editForm)}
                            className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingCase(null); setEditForm({}) }}
                            className="px-2 py-1 border border-border rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Display Mode */
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              c.type === 'trigger' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'
                            }`}>
                              {c.type}
                            </span>
                            <span className="font-medium">{c.name}</span>
                            {c.type === 'trigger' && c.shouldTrigger !== undefined && (
                              <span className={`text-xs ${c.shouldTrigger ? 'text-green-400' : 'text-red-400'}`}>
                                {c.shouldTrigger ? 'should trigger' : 'should NOT trigger'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-secondary">
                              {c.split}
                            </span>
                            {c.status === 'proposed' && (
                              <>
                                <button
                                  onClick={() => updateCase(c.id, 'accept')}
                                  className="p-1 rounded hover:bg-green-600/20 text-green-400"
                                  title="Accept"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => { setEditingCase(c.id); setEditForm({ name: c.name, prompt: c.prompt, expectedOutcome: c.expectedOutcome }) }}
                                  className="p-1 rounded hover:bg-accent text-muted-foreground"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => updateCase(c.id, 'reject')}
                                  className="p-1 rounded hover:bg-red-600/20 text-red-400"
                                  title="Reject"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            {(c.status === 'accepted' || c.status === 'edited') && (
                              <Check className="h-3.5 w-3.5 text-green-400" />
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          <span className="text-foreground/60">Prompt:</span> {c.prompt}
                        </p>
                        {c.expectedOutcome && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            <span className="text-foreground/60">Expected:</span> {c.expectedOutcome}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Committed Banner */}
          {activeSession.status === 'committed' && (
            <div className="border-t border-green-600/30 bg-green-600/10 px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-400">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {acceptedCount} test cases committed to eval suites
                </span>
              </div>
              <Link href="/evals" className="text-xs text-green-400 hover:underline">
                View Eval Suites →
              </Link>
            </div>
          )}

          {/* Input Area */}
          {activeSession.status !== 'committed' && (
            <div className="border-t border-border px-6 py-3 bg-card">
              {error && (
                <p className="text-xs text-red-400 mb-2">{error}</p>
              )}

              {showCorpusArea && (
                <div className="mb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      Paste Knowledge Corpus
                    </label>
                    <button onClick={() => setShowCorpusArea(false)} className="text-xs text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                  <textarea
                    value={corpusText}
                    onChange={e => setCorpusText(e.target.value)}
                    rows={6}
                    placeholder="Paste documentation, example inputs/outputs, runbooks, style guides, or any knowledge about your skill here..."
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm resize-none"
                    autoFocus
                  />
                  <button
                    onClick={sendCorpus}
                    disabled={!corpusText.trim() || sending}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
                  >
                    Send Knowledge
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCorpusArea(!showCorpusArea)}
                  className="px-2 py-2 border border-border rounded-md hover:bg-accent text-muted-foreground"
                  title="Paste knowledge corpus"
                >
                  <BookOpen className="h-4 w-4" />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm resize-none"
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No active session - Welcome screen */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-lg">
            <MessageSquarePlus className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
            <h2 className="text-2xl font-bold mb-3">AI-Guided Eval Builder</h2>
            <p className="text-muted-foreground mb-6">
              Build comprehensive evaluation suites through a simple conversation.
              No technical knowledge needed — just share your skill&apos;s knowledge and
              the AI will help you create ground truth test cases.
            </p>
            <div className="space-y-3 text-left text-sm text-muted-foreground bg-card border border-border rounded-lg p-4">
              <p className="font-medium text-foreground">How it works:</p>
              <p>1. <strong>Tell me about your skill</strong> — what it does, when it triggers</p>
              <p>2. <strong>Share knowledge</strong> — paste docs, examples, or describe expected behavior</p>
              <p>3. <strong>Review proposals</strong> — accept, reject, or edit AI-generated test cases</p>
              <p>4. <strong>Commit</strong> — save approved cases as eval suites, ready to run</p>
            </div>
            <button
              onClick={() => setShowNewSession(true)}
              className="mt-6 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 mx-auto"
            >
              <Plus className="h-4 w-4" />
              Start a Conversation
            </button>

            {sessions.length > 0 && (
              <div className="mt-6">
                <p className="text-xs text-muted-foreground mb-2">Or continue a previous conversation:</p>
                <div className="space-y-1">
                  {sessions.slice(0, 3).map(s => (
                    <button
                      key={s.id}
                      onClick={() => loadSession(s.id)}
                      className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent text-muted-foreground"
                    >
                      {s.title || 'Untitled'} — {s._count.messages} messages
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showNewSession && (
              <div className="mt-4 p-4 border border-border rounded-lg bg-card text-left">
                <label className="text-sm font-medium mb-2 block">Select a skill repo (optional)</label>
                <select
                  value={newSessionRepo}
                  onChange={e => setNewSessionRepo(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm mb-3"
                >
                  <option value="">No repo — describe your skill in chat</option>
                  {repos.map(r => (
                    <option key={r.id} value={r.id}>{r.displayName}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button onClick={createSession} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">
                    Start Conversation
                  </button>
                  <button onClick={() => setShowNewSession(false)} className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Simple markdown renderer for chat messages
function renderMarkdown(text: string): React.ReactNode {
  // Split into parts: bold, bullet points, code
  const parts = text.split(/(\*\*.*?\*\*|\n- |\n\d+\. )/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}
