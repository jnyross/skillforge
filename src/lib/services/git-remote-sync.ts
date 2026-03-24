/**
 * GitHub Remote Sync Service
 * 
 * Optional feature that allows pushing/pulling skill repos to/from
 * a remote git repository (GitHub, GitLab, Gitea, etc.).
 * 
 * This is fully optional — SkillForge works completely locally without it.
 */

import simpleGit from 'simple-git'
import { prisma } from '@/lib/prisma'

export interface RemoteSyncConfig {
  remoteUrl: string
  remoteName?: string // defaults to 'origin'
  branch?: string // defaults to 'main'
  authToken?: string // for HTTPS auth
}

export interface SyncResult {
  success: boolean
  direction: 'push' | 'pull'
  commitsSynced: number
  error?: string
}

/**
 * Configure a remote for a skill repo's git repository.
 */
export async function configureRemote(
  skillRepoId: string,
  config: RemoteSyncConfig
): Promise<{ success: boolean; error?: string }> {
  const repo = await prisma.skillRepo.findUnique({
    where: { id: skillRepoId },
    select: { gitRepoPath: true },
  })

  if (!repo || !repo.gitRepoPath) {
    return { success: false, error: 'Skill repo not found or has no git path' }
  }

  const git = simpleGit(repo.gitRepoPath)
  const remoteName = config.remoteName || 'origin'

  try {
    // Check if remote already exists
    const remotes = await git.getRemotes()
    const existingRemote = remotes.find(r => r.name === remoteName)

    let remoteUrl = config.remoteUrl
    // Inject auth token into HTTPS URL if provided
    if (config.authToken && remoteUrl.startsWith('https://')) {
      const url = new URL(remoteUrl)
      url.username = 'x-access-token'
      url.password = config.authToken
      remoteUrl = url.toString()
    }

    if (existingRemote) {
      await git.remote(['set-url', remoteName, remoteUrl])
    } else {
      await git.addRemote(remoteName, remoteUrl)
    }

    // Remote URL is stored in the git config (.git/config) by simple-git.
    // No need to store it in the DB — getSyncStatus reads from git directly.

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Push local changes to the configured remote.
 */
export async function pushToRemote(
  skillRepoId: string,
  remoteName: string = 'origin',
  branch: string = 'main'
): Promise<SyncResult> {
  const repo = await prisma.skillRepo.findUnique({
    where: { id: skillRepoId },
    select: { gitRepoPath: true },
  })

  if (!repo || !repo.gitRepoPath) {
    return { success: false, direction: 'push', commitsSynced: 0, error: 'Repo not found' }
  }

  const git = simpleGit(repo.gitRepoPath)

  try {
    // Check if remote exists
    const remotes = await git.getRemotes()
    if (!remotes.find(r => r.name === remoteName)) {
      return { success: false, direction: 'push', commitsSynced: 0, error: `Remote '${remoteName}' not configured` }
    }

    // Count local commits not on remote
    let commitCount = 0
    try {
      const log = await git.log([`${remoteName}/${branch}..HEAD`])
      commitCount = log.total
    } catch {
      // Remote branch may not exist yet — push all
      const log = await git.log()
      commitCount = log.total
    }

    await git.push(remoteName, branch, ['--set-upstream'])

    return { success: true, direction: 'push', commitsSynced: commitCount }
  } catch (err) {
    return {
      success: false,
      direction: 'push',
      commitsSynced: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Pull remote changes into local repo.
 */
export async function pullFromRemote(
  skillRepoId: string,
  remoteName: string = 'origin',
  branch: string = 'main'
): Promise<SyncResult> {
  const repo = await prisma.skillRepo.findUnique({
    where: { id: skillRepoId },
    select: { gitRepoPath: true },
  })

  if (!repo || !repo.gitRepoPath) {
    return { success: false, direction: 'pull', commitsSynced: 0, error: 'Repo not found' }
  }

  const git = simpleGit(repo.gitRepoPath)

  try {
    const remotes = await git.getRemotes()
    if (!remotes.find(r => r.name === remoteName)) {
      return { success: false, direction: 'pull', commitsSynced: 0, error: `Remote '${remoteName}' not configured` }
    }

    await git.fetch(remoteName, branch)

    // Count incoming commits
    let commitCount = 0
    try {
      const log = await git.log([`HEAD..${remoteName}/${branch}`])
      commitCount = log.total
    } catch {
      commitCount = 0
    }

    if (commitCount > 0) {
      await git.merge([`${remoteName}/${branch}`])
    }

    return { success: true, direction: 'pull', commitsSynced: commitCount }
  } catch (err) {
    return {
      success: false,
      direction: 'pull',
      commitsSynced: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Get sync status for a skill repo.
 */
export async function getSyncStatus(skillRepoId: string): Promise<{
  hasRemote: boolean
  remoteName?: string
  remoteUrl?: string
  ahead?: number
  behind?: number
}> {
  const repo = await prisma.skillRepo.findUnique({
    where: { id: skillRepoId },
    select: { gitRepoPath: true },
  })

  if (!repo || !repo.gitRepoPath) {
    return { hasRemote: false }
  }

  const git = simpleGit(repo.gitRepoPath)

  try {
    const remotes = await git.getRemotes(true)
    if (remotes.length === 0) {
      return { hasRemote: false }
    }

    const remote = remotes[0]
    const remoteUrl = (remote.refs as { fetch?: string; push?: string }).fetch || ''

    // Try to get ahead/behind counts
    let ahead = 0
    let behind = 0
    try {
      await git.fetch(remote.name)
      const status = await git.status()
      ahead = status.ahead
      behind = status.behind
    } catch {
      // Remote may not be reachable
    }

    return {
      hasRemote: true,
      remoteName: remote.name,
      remoteUrl: remoteUrl.replace(/x-access-token:[^@]+@/, ''), // Strip auth token
      ahead,
      behind,
    }
  } catch {
    return { hasRemote: false }
  }
}
