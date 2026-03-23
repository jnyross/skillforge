"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, GitBranch, FileText, Clock, AlertCircle, AlertTriangle, CheckCircle, Zap, Star, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sidebar } from '@/components/sidebar'

interface SkillRepo {
  id: string
  slug: string
  displayName: string
  description: string
  currentChampionVersionId: string | null
  createdAt: string
  updatedAt: string
  versions: Array<{
    id: string
    commitMessage: string
    createdAt: string
    isChampion: boolean
    fileCount: number
    lineCount: number
  }>
  lintResults: Array<{
    severity: string
  }>
  failingSuiteCount: number
  activeOptimizerCount: number
  _count: {
    versions: number
  }
}

export default function HomePage() {
  const [repos, setRepos] = useState<SkillRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newRepo, setNewRepo] = useState({
    slug: '',
    displayName: '',
    description: '',
    skillMdContent: '',
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchRepos()
  }, [])

  async function fetchRepos() {
    try {
      const res = await fetch('/api/skill-repos')
      if (!res.ok) {
        console.error('Failed to fetch repos:', res.status)
        setRepos([])
        return
      }
      const data = await res.json()
      setRepos(data)
    } catch (err) {
      console.error('Failed to fetch repos:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newRepo.slug || !newRepo.displayName) return
    setCreating(true)

    try {
      const files = newRepo.skillMdContent
        ? [{ path: 'SKILL.md', content: newRepo.skillMdContent, size: newRepo.skillMdContent.length }]
        : []

      const res = await fetch('/api/skill-repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: newRepo.slug,
          displayName: newRepo.displayName,
          description: newRepo.description,
          files: files.length > 0 ? files : undefined,
        }),
      })

      if (res.ok) {
        setCreateOpen(false)
        setNewRepo({ slug: '', displayName: '', description: '', skillMdContent: '' })
        fetchRepos()
      }
    } catch (err) {
      console.error('Failed to create repo:', err)
    } finally {
      setCreating(false)
    }
  }

  function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/" />
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold">Skill Repositories</h1>
              <p className="text-muted-foreground mt-1">
                Store, version, and evaluate your Claude Code skills
              </p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Skill Repo
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Create Skill Repository</DialogTitle>
                  <DialogDescription>
                    Create a new Git-backed repository for a Claude Code skill.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      placeholder="My Awesome Skill"
                      value={newRepo.displayName}
                      onChange={(e) => {
                        setNewRepo({
                          ...newRepo,
                          displayName: e.target.value,
                          slug: slugify(e.target.value),
                        })
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="slug">Slug</Label>
                    <Input
                      id="slug"
                      placeholder="my-awesome-skill"
                      value={newRepo.slug}
                      onChange={(e) => setNewRepo({ ...newRepo, slug: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Lowercase letters, numbers, hyphens, and underscores only
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      placeholder="What this skill does..."
                      value={newRepo.description}
                      onChange={(e) => setNewRepo({ ...newRepo, description: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="skillMd">Initial SKILL.md (optional)</Label>
                    <Textarea
                      id="skillMd"
                      placeholder={`---\nname: my-skill\ndescription: A skill that helps with...\n---\n\n# Instructions\n\n...`}
                      className="font-mono text-sm min-h-[200px]"
                      value={newRepo.skillMdContent}
                      onChange={(e) => setNewRepo({ ...newRepo, skillMdContent: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={creating || !newRepo.slug || !newRepo.displayName}>
                    {creating ? 'Creating...' : 'Create Repository'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : repos.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <GitBranch className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No skill repositories yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first skill repository to get started.
                </p>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Skill Repo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {repos.map((repo) => {
                const latestVersion = repo.versions[0]
                return (
                  <Link key={repo.id} href={`/skill-repos/${repo.id}`}>
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{repo.displayName}</CardTitle>
                            <CardDescription className="font-mono text-xs mt-1">
                              {repo.slug}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            {repo.lintResults && repo.lintResults.some(r => r.severity === 'error') && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {repo.lintResults.filter(r => r.severity === 'error').length} errors
                              </Badge>
                            )}
                            {repo.lintResults && !repo.lintResults.some(r => r.severity === 'error') && repo.lintResults.some(r => r.severity === 'warning') && (
                              <Badge variant="outline" className="flex items-center gap-1 border-yellow-500/50 text-yellow-500">
                                <AlertTriangle className="h-3 w-3" />
                                {repo.lintResults.filter(r => r.severity === 'warning').length} warnings
                              </Badge>
                            )}
                            {repo.lintResults && repo.lintResults.length > 0 && !repo.lintResults.some(r => r.severity === 'error') && !repo.lintResults.some(r => r.severity === 'warning') && (
                              <Badge variant="outline" className="flex items-center gap-1 border-green-500/50 text-green-500">
                                <CheckCircle className="h-3 w-3" />
                                Clean
                              </Badge>
                            )}
                            {repo.failingSuiteCount > 0 && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <XCircle className="h-3 w-3" />
                                {repo.failingSuiteCount} failing suite{repo.failingSuiteCount !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {repo.activeOptimizerCount > 0 && (
                              <Badge variant="outline" className="flex items-center gap-1 border-purple-500/50 text-purple-400">
                                <Zap className="h-3 w-3" />
                                {repo.activeOptimizerCount} optimizer{repo.activeOptimizerCount !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {repo.currentChampionVersionId && (
                              <Badge variant="outline" className="flex items-center gap-1 border-yellow-500/50 text-yellow-400">
                                <Star className="h-3 w-3" />
                                Champion
                              </Badge>
                            )}
                            <Badge variant="outline">
                              {repo._count.versions} version{repo._count.versions !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {repo.description && (
                          <p className="text-sm text-muted-foreground mb-3">{repo.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {latestVersion && (
                            <>
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {latestVersion.fileCount} files
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(latestVersion.createdAt).toLocaleDateString()}
                              </span>
                              <span className="truncate max-w-xs">
                                {latestVersion.commitMessage}
                              </span>
                            </>
                          )}
                          <span className="flex items-center gap-1 ml-auto">
                            <Clock className="h-3 w-3" />
                            Updated {new Date(repo.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
