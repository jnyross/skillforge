"use client"

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, GitCommit, FileText, Clock, Plus, RotateCcw,
  AlertTriangle, AlertCircle, Info, CheckCircle, GitBranch,
  Diff, Upload, Download, Hash, Type, BarChart3, Tag, X, Globe, User,
  FlaskConical, Users, Star, Zap, ExternalLink, TrendingUp
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
import { useTechLevel, toTitleCase } from '@/lib/context/tech-level-context'

interface VersionTagItem {
  id: string
  name: string
  color: string
}

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
  tags?: VersionTagItem[]
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
  tags: VersionTagItem[]
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
  const { terms } = useTechLevel()

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
  const [activeTab, setActiveTab] = useState('overview')

  // Import dialog
  const [importOpen, setImportOpen] = useState(false)
  const [importMode, setImportMode] = useState<'files' | 'zip' | 'git'>('files')
  const [importFiles, setImportFiles] = useState('')
  const [importMessage, setImportMessage] = useState('Import files')
  const [importing, setImporting] = useState(false)
  const [gitUrl, setGitUrl] = useState('')
  const [gitBranch, setGitBranch] = useState('')
  const [gitSubfolder, setGitSubfolder] = useState('')

  // Tag management
  const [newTagName, setNewTagName] = useState('')
  const [addingTag, setAddingTag] = useState(false)

  // Linked resources state
  const [linkedEvalRuns, setLinkedEvalRuns] = useState<Array<{
    id: string; status: string; suiteId: string; metricsJson: string; createdAt: string;
    suite?: { name: string };
  }>>([])
  const [linkedReviews, setLinkedReviews] = useState<Array<{
    id: string; name: string; type: string; status: string; createdAt: string;
  }>>([])

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
      if (!res.ok) {
        console.error('Failed to load version:', res.status)
        return
      }
      const data = await res.json()
      setSelectedVersion(data)

      // Load linked eval runs
      try {
        const runsRes = await fetch(`/api/eval-runs?skillVersionId=${versionId}`)
        if (runsRes.ok) {
          const runsData = await runsRes.json()
          setLinkedEvalRuns(Array.isArray(runsData) ? runsData : runsData.runs || [])
        }
      } catch { /* ignore */ }

      // Load linked review sessions (scoped to repo, not version — ReviewSession has no skillVersionId)
      try {
        const reviewsRes = await fetch(`/api/review-sessions?skillRepoId=${repoId}`)
        if (reviewsRes.ok) {
          const reviewsData = await reviewsRes.json()
          setLinkedReviews(Array.isArray(reviewsData) ? reviewsData : reviewsData.sessions || [])
        }
      } catch { /* ignore */ }
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
      if (!res.ok) {
        console.error('Failed to compute diff:', res.status)
        return
      }
      const data = await res.json()
      setDiffResult(data.diff.files)
    } catch (err) {
      console.error('Failed to compute diff:', err)
    } finally {
      setLoadingDiff(false)
    }
  }

  async function handleAddTag() {
    if (!selectedVersion || !newTagName.trim()) return
    setAddingTag(true)
    try {
      const res = await fetch(`/api/skill-repos/${repoId}/versions/${selectedVersion.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim() }),
      })
      if (res.ok) {
        const tag = await res.json()
        setSelectedVersion({
          ...selectedVersion,
          tags: [...(selectedVersion.tags || []), tag],
        })
        setNewTagName('')
      }
    } catch (err) {
      console.error('Failed to add tag:', err)
    } finally {
      setAddingTag(false)
    }
  }

  async function handleRemoveTag(tagName: string) {
    if (!selectedVersion) return
    try {
      const res = await fetch(
        `/api/skill-repos/${repoId}/versions/${selectedVersion.id}/tags?name=${encodeURIComponent(tagName)}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        setSelectedVersion({
          ...selectedVersion,
          tags: (selectedVersion.tags || []).filter(t => t.name !== tagName),
        })
      }
    } catch (err) {
      console.error('Failed to remove tag:', err)
    }
  }

  async function handleImport() {
    if (importMode === 'git') {
      if (!gitUrl.trim()) return
      setImporting(true)
      try {
        const res = await fetch(`/api/skill-repos/${repoId}/import-git`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: gitUrl.trim(),
            message: importMessage,
            branch: gitBranch || undefined,
            subfolder: gitSubfolder || undefined,
          }),
        })
        if (res.ok) {
          setImportOpen(false)
          setGitUrl('')
          setGitBranch('')
          setGitSubfolder('')
          setImportMessage('Import files')
          fetchRepo()
        } else {
          const data = await res.json()
          alert(data.error || 'Import failed')
        }
      } catch (err) {
        console.error('Failed to import from git:', err)
      } finally {
        setImporting(false)
      }
      return
    }

    if (importMode === 'zip') {
      const fileInput = document.getElementById('zipFileInput') as HTMLInputElement
      if (!fileInput?.files?.[0]) return
      setImporting(true)

      try {
        const formData = new FormData()
        formData.append('zipFile', fileInput.files[0])
        formData.append('message', importMessage)

        const res = await fetch(`/api/skill-repos/${repoId}/import`, {
          method: 'POST',
          body: formData,
        })

        if (res.ok) {
          setImportOpen(false)
          setImportFiles('')
          setImportMessage('Import files')
          fetchRepo()
        }
      } catch (err) {
        console.error('Failed to import:', err)
      } finally {
        setImporting(false)
      }
    } else {
      if (!importFiles.trim()) return
      setImporting(true)

      try {
        let files
        try {
          files = JSON.parse(importFiles)
        } catch {
          alert('Invalid JSON. Expected array of {path, content} objects.')
          setImporting(false)
          return
        }

        const res = await fetch(`/api/skill-repos/${repoId}/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files,
            message: importMessage,
          }),
        })

        if (res.ok) {
          setImportOpen(false)
          setImportFiles('')
          setImportMessage('Import files')
          fetchRepo()
        }
      } catch (err) {
        console.error('Failed to import:', err)
      } finally {
        setImporting(false)
      }
    }
  }

  function handleExportZip() {
    if (!selectedVersion) return
    window.open(`/api/skill-repos/${repoId}/export/${selectedVersion.id}?format=zip`, '_blank')
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

  const ratingColor = (rating: string) => {
    switch (rating) {
      case 'good': return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'fair': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'poor': return 'bg-red-500/20 text-red-400 border-red-500/30'
      default: return 'bg-muted text-muted-foreground border-muted'
    }
  }

  function computeScorecard(lintResults: LintResultItem[]) {
    const categories = [
      'spec-correctness', 'trigger-quality', 'scope-clarity',
      'context-efficiency', 'instruction-quality', 'safety-control',
      'validation-discipline', 'scriptability', 'eval-coverage',
      'observed-execution-quality',
    ]
    return categories.map(category => {
      const catIssues = lintResults.filter(i => i.category === category)
      const errors = catIssues.filter(i => i.severity === 'error')
      const warnings = catIssues.filter(i => i.severity === 'warning')
      let rating = 'unknown'
      if (category === 'observed-execution-quality' || category === 'eval-coverage') {
        rating = 'unknown'
      } else if (errors.length > 0) {
        rating = 'poor'
      } else if (warnings.length > 0) {
        rating = 'fair'
      } else {
        rating = 'good'
      }
      return { category, rating, issues: catIssues }
    })
  }

  function extractFrontmatter(version: VersionDetail) {
    const skillMd = version.files.find(f => f.path === 'SKILL.md')
    if (!skillMd) return null
    const content = skillMd.content
    if (!content.startsWith('---')) return null
    const endIdx = content.indexOf('---', 3)
    if (endIdx === -1) return null
    const fmBlock = content.slice(3, endIdx).trim()
    const fields: Record<string, string> = {}
    for (const line of fmBlock.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim()
        const value = line.slice(colonIdx + 1).trim()
        fields[key] = value
      }
    }
    return fields
  }

  const categoryLabel = (cat: string) =>
    cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

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
            <Link href={`/skill-repos/${repoId}/improve`}>
              <Button variant="outline">
                <TrendingUp className="mr-2 h-4 w-4" />
                Improve
              </Button>
            </Link>
            <Link href={`/skill-repos/${repoId}/trigger-optimizer`}>
              <Button variant="outline">
                <Zap className="mr-2 h-4 w-4" />
                Optimize Trigger
              </Button>
            </Link>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Import Files</DialogTitle>
                  <DialogDescription>
                    Import skill files from a zip file or JSON file list.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="flex gap-2">
                    <Button
                      variant={importMode === 'zip' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setImportMode('zip')}
                    >
                      Zip Upload
                    </Button>
                    <Button
                      variant={importMode === 'files' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setImportMode('files')}
                    >
                      JSON Files
                    </Button>
                    <Button
                      variant={importMode === 'git' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setImportMode('git')}
                    >
                      <Globe className="mr-1 h-3 w-3" />
                      Git URL
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="importMessage">Commit Message</Label>
                    <Input
                      id="importMessage"
                      value={importMessage}
                      onChange={(e) => setImportMessage(e.target.value)}
                    />
                  </div>
                  {importMode === 'zip' ? (
                    <div className="grid gap-2">
                      <Label htmlFor="zipFileInput">Zip File</Label>
                      <Input id="zipFileInput" type="file" accept=".zip" />
                    </div>
                  ) : importMode === 'git' ? (
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="gitUrl">Git URL</Label>
                        <Input
                          id="gitUrl"
                          placeholder="https://git.example.com/user/repo.git"
                          value={gitUrl}
                          onChange={(e) => setGitUrl(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="gitBranch">Branch (optional)</Label>
                          <Input
                            id="gitBranch"
                            placeholder="main"
                            value={gitBranch}
                            onChange={(e) => setGitBranch(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="gitSubfolder">Subfolder (optional)</Label>
                          <Input
                            id="gitSubfolder"
                            placeholder="path/to/skill"
                            value={gitSubfolder}
                            onChange={(e) => setGitSubfolder(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Label htmlFor="importFilesJson">Files JSON</Label>
                      <Textarea
                        id="importFilesJson"
                        className="font-mono text-sm min-h-[200px]"
                        placeholder='[{"path": "SKILL.md", "content": "# My Skill", "size": 10}]'
                        value={importFiles}
                        onChange={(e) => setImportFiles(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? 'Importing...' : 'Import'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {selectedVersion && (
              <Button variant="outline" onClick={handleExportZip}>
                <Download className="mr-2 h-4 w-4" />
                Export Zip
              </Button>
            )}
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
                    {toTitleCase(terms.skillVersion)}s ({repo.versions.length})
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
                        {version.tags && version.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {version.tags.map((tag) => (
                              <Badge key={tag.id} variant="outline" className="text-xs py-0 px-1">
                                <Tag className="h-2 w-2 mr-0.5" />
                                {tag.name}
                              </Badge>
                            ))}
                          </div>
                        )}
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
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="files">Files</TabsTrigger>
                      <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
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

                  {/* Overview tab */}
                  <TabsContent value="overview">
                    <div className="space-y-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">{toTitleCase(terms.skillVersion)} Info</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-2">
                              <Hash className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Commit</p>
                                <p className="font-mono text-sm">{selectedVersion.gitCommitSha.slice(0, 12)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <GitBranch className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Branch</p>
                                <p className="text-sm">{selectedVersion.branchName}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Files</p>
                                <p className="text-sm">{selectedVersion.fileCount} files, {selectedVersion.lineCount} lines</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Type className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Tokens (est.)</p>
                                <p className="text-sm">~{selectedVersion.tokenCount.toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Created</p>
                                <p className="text-sm">{new Date(selectedVersion.createdAt).toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Author</p>
                                <p className="text-sm">{selectedVersion.createdBy}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <BarChart3 className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Status</p>
                                <p className="text-sm">{selectedVersion.isChampion ? 'Champion' : 'Version'}</p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Tags section */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Tag className="h-4 w-4" />
                            Tags
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {(selectedVersion.tags || []).map((tag) => (
                              <Badge key={tag.id} variant="outline" className="flex items-center gap-1">
                                {tag.name}
                                <button
                                  onClick={() => handleRemoveTag(tag.name)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                            {(!selectedVersion.tags || selectedVersion.tags.length === 0) && (
                              <span className="text-xs text-muted-foreground">No tags yet</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Add tag..."
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                              className="h-8 text-sm"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleAddTag}
                              disabled={addingTag || !newTagName.trim()}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {(() => {
                        const fm = extractFrontmatter(selectedVersion)
                        if (!fm) return null
                        return (
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base">Frontmatter</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                {Object.entries(fm).map(([key, value]) => (
                                  <div key={key} className="flex items-start gap-2">
                                    <span className="text-xs font-mono text-muted-foreground min-w-[140px]">{key}:</span>
                                    <span className="text-sm break-all">{value}</span>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })()}

                      {selectedVersion.lintResults.length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <BarChart3 className="h-4 w-4" />
                              Scorecard Summary
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-5 gap-2">
                              {computeScorecard(selectedVersion.lintResults).map(({ category, rating }) => (
                                <div
                                  key={category}
                                  className={`text-center p-2 rounded-lg border text-xs ${ratingColor(rating)}`}
                                >
                                  <p className="font-medium truncate" title={categoryLabel(category)}>
                                    {categoryLabel(category)}
                                  </p>
                                  <p className="mt-1 font-bold capitalize">{rating}</p>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Lint Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <AlertCircle className="h-4 w-4 text-red-400" />
                              <span className="text-sm">{selectedVersion.lintResults.filter(r => r.severity === 'error').length} errors</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-4 w-4 text-yellow-400" />
                              <span className="text-sm">{selectedVersion.lintResults.filter(r => r.severity === 'warning').length} warnings</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Info className="h-4 w-4 text-blue-400" />
                              <span className="text-sm">{selectedVersion.lintResults.filter(r => r.severity === 'info').length} info</span>
                            </div>
                            {selectedVersion.lintResults.length === 0 && (
                              <div className="flex items-center gap-1">
                                <CheckCircle className="h-4 w-4 text-green-400" />
                                <span className="text-sm text-muted-foreground">No issues (run lint to check)</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">File Tree</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-1">
                            {selectedVersion.files.map((file) => (
                              <div key={file.path} className="flex items-center gap-2 text-sm">
                                <FileText className="h-3 w-3 text-muted-foreground" />
                                <span className="font-mono text-xs">{file.path}</span>
                                <span className="text-xs text-muted-foreground ml-auto">{file.size} B</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Linked Eval Runs */}
                      {linkedEvalRuns.length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <FlaskConical className="h-4 w-4" />
                              Linked Eval Runs ({linkedEvalRuns.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {linkedEvalRuns.slice(0, 5).map((run) => {
                                let passRate: number | undefined
                                try {
                                  const m = JSON.parse(run.metricsJson || '{}')
                                  passRate = m.passRate
                                } catch { /* ignore */ }
                                return (
                                  <Link key={run.id} href={`/evals/runs/${run.id}`}>
                                    <div className="flex items-center justify-between p-2 rounded hover:bg-accent/50">
                                      <div className="flex items-center gap-2">
                                        <Badge variant={run.status === 'completed' ? 'outline' : 'secondary'} className="text-xs">
                                          {run.status}
                                        </Badge>
                                        <span className="text-sm">{run.suite?.name || run.suiteId.slice(0, 8)}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {passRate !== undefined && (
                                          <span className={`text-xs font-mono ${passRate >= 0.8 ? 'text-green-400' : passRate >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                            {(passRate * 100).toFixed(0)}%
                                          </span>
                                        )}
                                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                      </div>
                                    </div>
                                  </Link>
                                )
                              })}
                              {linkedEvalRuns.length > 5 && (
                                <p className="text-xs text-muted-foreground text-center">+{linkedEvalRuns.length - 5} more</p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Linked Reviews */}
                      {linkedReviews.length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Linked Reviews ({linkedReviews.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {linkedReviews.slice(0, 5).map((review) => (
                                <Link key={review.id} href={`/reviews/${review.id}`}>
                                  <div className="flex items-center justify-between p-2 rounded hover:bg-accent/50">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs">{review.type}</Badge>
                                      <span className="text-sm">{review.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant={review.status === 'completed' ? 'outline' : 'secondary'} className="text-xs">
                                        {review.status}
                                      </Badge>
                                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                    </div>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Champion indicator */}
                      {selectedVersion.isChampion && (
                        <Card className="border-yellow-500/30">
                          <CardContent className="p-4 flex items-center gap-3">
                            <Star className="h-5 w-5 text-yellow-400" />
                            <div>
                              <p className="font-medium">Champion Version</p>
                              <p className="text-xs text-muted-foreground">This version is the current champion for this skill repository.</p>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </TabsContent>

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

                  {/* Scorecard tab */}
                  <TabsContent value="scorecard">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />
                          Best-Practice Scorecard
                        </CardTitle>
                        <CardDescription>
                          10-category quality assessment based on lint analysis
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {selectedVersion.lintResults.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground">
                            <BarChart3 className="mx-auto h-8 w-8 mb-2" />
                            <p>Run lint to generate scorecard</p>
                            <Button variant="outline" size="sm" className="mt-2" onClick={handleRunLint}>
                              Run Lint
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {computeScorecard(selectedVersion.lintResults).map(({ category, rating, issues }) => (
                              <div key={category} className="border rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium">{categoryLabel(category)}</span>
                                  <Badge className={`text-xs ${ratingColor(rating)}`}>
                                    {rating}
                                  </Badge>
                                </div>
                                {issues.length > 0 ? (
                                  <div className="space-y-1">
                                    {issues.map((issue, idx) => (
                                      <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                                        {severityIcon(issue.severity)}
                                        <span>{issue.message}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    {rating === 'unknown' ? 'Requires eval runs to assess' : 'No issues found'}
                                  </p>
                                )}
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
