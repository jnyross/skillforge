'use client'

import { useEffect, useState } from 'react'
import { Settings, Plus, CheckCircle, XCircle, RefreshCw, Shield } from 'lucide-react'

interface ExecutorConfigItem {
  id: string
  name: string
  type: string
  isDefault: boolean
  configJson: string
  status: string
  lastHealthCheck: string | null
  createdAt: string
}

export default function SettingsPage() {
  const [executors, setExecutors] = useState<ExecutorConfigItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('claude-cli')

  useEffect(() => {
    loadExecutors()
  }, [])

  const loadExecutors = () => {
    fetch('/api/executor-config')
      .then(r => r.json())
      .then(data => { setExecutors(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  const addExecutor = async () => {
    if (!newName) return
    const res = await fetch('/api/executor-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName,
        type: newType,
        isDefault: executors.length === 0,
      }),
    })
    if (res.ok) {
      setNewName('')
      setShowAddForm(false)
      loadExecutors()
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure executors, defaults, and system settings
        </p>
      </div>

      {/* Executors section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Executors</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Executor
          </button>
        </div>

        {showAddForm && (
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g., Production CLI"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Type</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                >
                  <option value="claude-cli">Claude CLI</option>
                  <option value="mock">Mock (Testing)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addExecutor}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : executors.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center">
            <Settings className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No executors configured. Add a Claude CLI or Mock executor to run evals.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {executors.map(exec => (
              <div
                key={exec.id}
                className="border border-border rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {exec.status === 'active' ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <span className="font-medium">{exec.name}</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">
                      {exec.type}
                    </span>
                    {exec.isDefault && (
                      <span className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">
                        default
                      </span>
                    )}
                  </div>
                  <button className="text-muted-foreground hover:text-foreground">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
                {exec.lastHealthCheck && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last health check: {new Date(exec.lastHealthCheck).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Execution Modes section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5" /> Execution Modes
        </h2>
        <p className="text-sm text-muted-foreground">
          Control what Claude Code is allowed to do during eval execution.
        </p>
        <div className="space-y-3">
          {[
            { mode: 'read-only', label: 'Read Only', desc: 'Can only read files and environment. No writes or side effects.', color: 'border-green-500/30' },
            { mode: 'edit', label: 'Edit', desc: 'Can read and write files. No external side effects (network, exec).', color: 'border-blue-500/30' },
            { mode: 'side-effect', label: 'Full Access', desc: 'Full access — can run commands, make network calls, modify filesystem.', color: 'border-amber-500/30' },
          ].map(m => (
            <div key={m.mode} className={`border ${m.color} rounded-lg p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{m.label}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">--permission-mode {m.mode}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">{m.mode}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{m.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Set the execution mode per eval run when creating a run. The default mode is controlled by the executor configuration.
        </p>
      </div>

      {/* Security section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Security</h2>
        <div className="border border-border rounded-lg p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">Symlink Attack Prevention</span>
              <p className="text-xs text-muted-foreground">Zip imports are scanned for symlink attacks</p>
            </div>
            <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">Folder Import Allowlist</span>
              <p className="text-xs text-muted-foreground">Only allowed paths can be imported from filesystem</p>
            </div>
            <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">Audit Logging</span>
              <p className="text-xs text-muted-foreground">All significant actions are logged</p>
            </div>
            <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">Optimistic Locking</span>
              <p className="text-xs text-muted-foreground">Concurrent version saves are prevented</p>
            </div>
            <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400">Active</span>
          </div>
        </div>
      </div>

      {/* System info section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">System</h2>
        <div className="border border-border rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Database</span>
            <span>SQLite (dev) / PostgreSQL (prod)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Job Queue</span>
            <span>In-process (dev) / Redis + BullMQ (prod)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Git Storage</span>
            <span>Local filesystem via simple-git</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span>0.3.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
