"use client"

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, GitCommit, FileText, Clock, Plus, RotateCcw,
  AlertTriangle, AlertCircle, Info, CheckCircle, GitBranch,
  Download, Diff
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sidebar } from '@/components/sidebar'

interface SkillVersion {
  id: string
  branchName: string
  gitCommitSha: string
  parentVersionId: string | null
  commitMessage: string
  createdBy: string
  createdAt: string
  tokenCount: number
  lineCount: number
  fileCount: number
  isChampion: boolean
  notes: string
}

interface LintResultItem {
  id: string
  severity: string
  category: string
  rule: string
  message: string
  file: string
  line: number | null
  evidence: string
}

interface SkillFileItem {
  path: string
  content: string
  size: number
}

interface VersionDetail extends SkillVersion {
  files: SkillFileItem[]
  lintResults: LintResultItem[]
}

interface DiffFile {
  path: string
  status: 'added' | 'removed' | 'modified'
  hunks: string
}

export default function SkillRepoPage() {
  const params = useParams()
  const router = useRouter()
  const repoId = params.id as string

  const [repo, setRepo] = useState<{
    id: string
    slug: string
    displayName: string
    description: string
    currentChampionVersionId: string | null
    versions: SkillVersion[]
    lintResults: LintResultItem[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState<VersionDetail | null>(null)
  const [loadingVersion, setLoadingVersion] = useState(false)
  const [activeTab, setActiveTab] = useState('files')

  // New version dialog
  const [newVersionOpen, setNewVersionOpen] = useState(false)
  const [newVersionData, setNewVersionData] = useState({
    message: '',
    skillMdContent: '',
  })
  const [saving, setSaving] = useState(false)

  // Diff state
  const [diffFrom, setDiffFrom] = useState<string>('')
  const [diffTo, setDiffTo] = useState<string>('')
  const [diffResult, setDiffResult] = useState<DiffFile[] | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)

  const loadVersion = useCallback(async (versionId: string) => {
    setLoadingVersion(true)
    try {
      const res = await fetch(`/api/skill-repos/${repoId}/versions/${versionId}`)
      const data = await res.json()
      setSelectedVersion(data)
    } catch (err) {
      console.error('Failed to load version:', err)
    } finally {
      setLoadingVersion(false)
    }
  }, [repoId])

  const fetchRepo = useCallback(async () => {
    try {
      const res = await fetch(`/api/skill-repos/${repoId}`)
      if (!res.ok) {
        router.push('/')
        return
      }
      const data = await res.json()
      setRepo(data)

      // Load latest version detail
      if (data.versions.length > 0) {
        loadVersion(data.versions[0].id)
      }
    } catch (err) {
      console.error('Failed to fetch repo:', err)
    } finally {
      setLoading(false)
    }
  }, [repoId, router, loadVersion])

  useEffect(() => {
    fetchRepo()
  }, [fetchRepo])

  async function handleSaveVersion() {
    if (!newVersionData.message || !newVersionData.skillMdContent) return
    setSaving(true)

    try {
      const files = [
        { path: 'SKILL.md', content: newVersionData.skillMdContent, size: newVersionData.skillMdContent.length },
      ]

      const res = await fetch(`/api/skill-repos/${repoId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files,
          message: newVersionData.message,
        }),
      })

      if (res.ok) {
        setNewVersionOpen(false)
        setNewVersionData({ message: '', skillMdContent: '' })
        fetchRepo()
      }
    } catch (err) {
      console.error('Failed to save version:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleRestore(versionId: string) {
    if (!confirm('Restore this version? A new version will be created with the restored files.')) return

    try {
      const res = await fetch(`/api/skill-repos/${repoId}/restore/${versionId}`, {
        method: 'POST',
      })
      if (res.ok) {
        fetchRepo()
      }
    } catch (err) {
      console.error('Failed to restore version:', err)
    }
  }

  async function handleDiff() {
    if (!diffFrom || !diffTo) return
    setLoadingDiff(true)

    try {
      const res = await fetch(`/api/skill-repos/${repoId}/diff?from=${diffFrom}&to=${diffTo}`)
      const data = await res.json()
      setDiffResult(data.diff.files)
    } catch (err) {
      console.error('Failed to compute diff:', err)
    } finally {
      setLoadingDiff(false)
    }
  }

  async function handleRunLint() {
    try {
      const res = await fetch(`/api/skill-repos/${repoId}/lint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        fetchRepo()
        if (selectedVersion) {
          loadVersion(selectedVersion.id)
        }
      }
    } catch (err) {
      console.error('Failed to run lint:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar activePath="/" />
        <main className="flex-1 p-8">
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        </main>
      </div>
    )
  }

  if (!repo) {
    return (
      <div className="flex min-h-screen">
        <Sidebar activePath="/" />
        <main className="flex-1 p-8">
          <div className="text-center py-12 text-muted-foreground">Repo not found</div>
        </main>
      </div>
    )
  }

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <AlertCircle className="h-4 w-4 text-red-400" />
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-400" />
      case 'info': return <Info className="h-4 w-4 text-blue-400" />
      default: return null
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/" />
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{repo.displayName}</h1>
              <p className="text-sm text-muted-foreground font-mono">{repo.slug}</p>
            </div>
            <Button variant="outline" onClick={handleRunLint}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Run Lint
            </Button>
            <Dialog open={newVersionOpen} onOpenChange={setNewVersionOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Version
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px]">
                <DialogHeader>
                  <DialogTitle>Save New Version</DialogTitle>
                  <DialogDescription>
                    Save the current skill files as a new immutable version.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="commitMsg">Commit Message</Label>
                    <Input
                      id="commitMsg"
                      placeholder="What changed in this version?"
                      value={newVersionData.message}
                      onChange={(e) => setNewVersionData({ ...newVersionData, message: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="skillMdEdit">SKILL.md</Label>
                    <Textarea
                      id="skillMdEdit"
                      className="font-mono text-sm min-h-[300px]"
                      value={newVersionData.skillMdContent}
                      onChange={(e) => setNewVersionData({ ...newVersionData, skillMdContent: e.target.value })}
                      placeholder={`---\nname: ${repo.slug}\ndescription: ...\n---\n\n# Instructions\n\n...`}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewVersionOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleSaveVersion}
                    disabled={saving || !newVersionData.message || !newVersionData.skillMdContent}
                  >
                    {saving ? 'Saving...' : 'Save Version'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {repo.description && (
            <p className="text-muted-foreground mb-6">{repo.description}</p>
          )}

          <div className="grid grid-cols-3 gap-6">
            {/* Version list (left sidebar) */}
            <div className="col-span-1">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GitCommit className="h-4 w-4" />
                    Versions ({repo.versions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-96">
                    {repo.versions.map((version) => (
                      <button
                        key={version.id}
                        onClick={() => loadVersion(version.id)}
                        className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-accent/50 ${
                          selectedVersion?.id === version.id ? 'bg-accent' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{version.commitMessage}</p>
                            <p className="text-xs text-muted-foreground font-mono mt-1">
                              {version.gitCommitSha.slice(0, 8)}
                            </p>
                          </div>
                          {version.isChampion && (
                            <Badge variant="success" className="ml-2 shrink-0">Champion</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{version.fileCount} files</span>
                          <span>{version.lineCount} lines</span>
                          <span>{new Date(version.createdAt).toLocaleDateString()}</span>
                        </div>
                      </button>
                    ))}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Version detail (right content) */}
            <div className="col-span-2">
              {loadingVersion ? (
                <div className="text-center py-12 text-muted-foreground">Loading version...</div>
              ) : selectedVersion ? (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="flex items-center justify-between mb-4">
                    <TabsList>
                      <TabsTrigger value="files">Files</TabsTrigger>
                      <TabsTrigger value="lint">
                        Lint
                        {selectedVersion.lintResults.length > 0 && (
                          <Badge variant="outline" className="ml-2">
                            {selectedVersion.lintResults.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="diff">Diff</TabsTrigger>
                    </TabsList>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(selectedVersion.id)}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Restore
                      </Button>
                    </div>
                  </div>

                  {/* Files tab */}
                  <TabsContent value="files">
                    <div className="space-y-4">
                      {selectedVersion.files.map((file) => (
                        <Card key={file.path}>
                          <CardHeader className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono text-sm">{file.path}</span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {file.size} bytes
                              </span>
                            </div>
                          </CardHeader>
                          <CardContent className="p-0">
                            <pre className="p-4 text-sm font-mono overflow-x-auto bg-muted/30 rounded-b-lg max-h-96 overflow-y-auto">
                              {file.content}
                            </pre>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>

                  {/* Lint tab */}
                  <TabsContent value="lint">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Lint Results</CardTitle>
                        <CardDescription>
                          {selectedVersion.lintResults.filter(r => r.severity === 'error').length} errors,{' '}
                          {selectedVersion.lintResults.filter(r => r.severity === 'warning').length} warnings,{' '}
                          {selectedVersion.lintResults.filter(r => r.severity === 'info').length} info
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {selectedVersion.lintResults.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground">
                            <CheckCircle className="mx-auto h-8 w-8 mb-2 text-green-400" />
                            <p>No lint issues found</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {selectedVersion.lintResults.map((result) => (
                              <div
                                key={result.id}
                                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
                              >
                                {severityIcon(result.severity)}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium">{result.message}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Badge variant="outline" className="text-xs">{result.category}</Badge>
                                    <span className="font-mono">{result.rule}</span>
                                    {result.line && <span>line {result.line}</span>}
                                  </div>
                                  {result.evidence && (
                                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                                      {result.evidence}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Diff tab */}
                  <TabsContent value="diff">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Diff className="h-4 w-4" />
                          Compare Versions
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-end gap-4 mb-4">
                          <div className="flex-1">
                            <Label className="text-xs">From</Label>
                            <select
                              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={diffFrom}
                              onChange={(e) => setDiffFrom(e.target.value)}
                            >
                              <option value="">Select version...</option>
                              {repo.versions.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.gitCommitSha.slice(0, 8)} - {v.commitMessage}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs">To</Label>
                            <select
                              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={diffTo}
                              onChange={(e) => setDiffTo(e.target.value)}
                            >
                              <option value="">Select version...</option>
                              {repo.versions.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.gitCommitSha.slice(0, 8)} - {v.commitMessage}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Button onClick={handleDiff} disabled={!diffFrom || !diffTo || loadingDiff}>
                            {loadingDiff ? 'Computing...' : 'Compare'}
                          </Button>
                        </div>

                        {diffResult && (
                          <div className="space-y-4 mt-4">
                            {diffResult.length === 0 ? (
                              <p className="text-center text-muted-foreground py-4">No differences found</p>
                            ) : (
                              diffResult.map((file) => (
                                <div key={file.path} className="border rounded-lg overflow-hidden">
                                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b">
                                    <Badge
                                      variant={
                                        file.status === 'added' ? 'success' :
                                        file.status === 'removed' ? 'destructive' :
                                        'outline'
                                      }
                                    >
                                      {file.status}
                                    </Badge>
                                    <span className="font-mono text-sm">{file.path}</span>
                                  </div>
                                  {file.hunks && (
                                    <pre className="p-4 text-xs font-mono overflow-x-auto bg-muted/20 max-h-64 overflow-y-auto">
                                      {file.hunks}
                                    </pre>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Select a version to view details
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
