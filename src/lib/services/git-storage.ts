import simpleGit, { SimpleGit } from 'simple-git'
import fs from 'fs/promises'
import path from 'path'
import { config } from '@/lib/config'
import type { SkillFile, VersionDiff, FileDiff } from '@/types/skill'

/**
 * Initialize a new bare git repository for a skill repo.
 */
export async function initSkillGitRepo(repoId: string): Promise<string> {
  const repoPath = path.join(config.skillReposPath, repoId)
  await fs.mkdir(repoPath, { recursive: true })

  const git = simpleGit(repoPath)
  await git.init()
  await git.addConfig('user.email', 'skillforge@local')
  await git.addConfig('user.name', 'SkillForge')

  return repoPath
}

/**
 * Get a SimpleGit instance for a skill repo.
 */
export function getGit(repoPath: string): SimpleGit {
  return simpleGit(repoPath)
}

/**
 * Write files to a skill repo working directory.
 */
export async function writeFiles(repoPath: string, files: SkillFile[]): Promise<void> {
  const resolvedRepoPath = path.resolve(repoPath)
  for (const file of files) {
    if (path.isAbsolute(file.path)) {
      throw new Error(`Absolute file paths are not allowed: ${file.path}`)
    }
    const target = path.resolve(resolvedRepoPath, file.path)
    if (!target.startsWith(resolvedRepoPath + path.sep) && target !== resolvedRepoPath) {
      throw new Error(`Path traversal detected: ${file.path}`)
    }
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, file.content, 'utf-8')
  }
}

/**
 * Read all files from a skill repo working directory.
 */
export async function readFiles(repoPath: string, excludeGit = true): Promise<SkillFile[]> {
  const files: SkillFile[] = []

  async function walk(dir: string, prefix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (excludeGit && entry.name === '.git') continue
      const fullPath = path.join(dir, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        await walk(fullPath, relativePath)
      } else {
        const content = await fs.readFile(fullPath, 'utf-8')
        files.push({
          path: relativePath,
          content,
          size: Buffer.byteLength(content, 'utf-8'),
        })
      }
    }
  }

  await walk(repoPath, '')
  return files
}

/**
 * Create a new version (commit) in the skill repo.
 * Writes files, stages everything, and commits.
 */
export async function createVersion(
  repoPath: string,
  files: SkillFile[],
  message: string,
  branchName: string = 'main'
): Promise<string> {
  const git = getGit(repoPath)

  // Check if the branch exists
  const branches = await git.branchLocal()
  if (branches.all.length === 0) {
    // First commit - just write and commit
  } else if (!branches.all.includes(branchName)) {
    // Create and switch to new branch
    await git.checkoutLocalBranch(branchName)
  } else if (branches.current !== branchName) {
    await git.checkout(branchName)
  }

  // Clean working directory (remove tracked files, keep .git)
  const existingFiles = await readFiles(repoPath)
  for (const file of existingFiles) {
    const filePath = path.join(repoPath, file.path)
    await fs.unlink(filePath).catch(() => {})
  }

  // Write new files
  await writeFiles(repoPath, files)

  // Stage all changes
  await git.add('-A')

  // Commit
  const result = await git.commit(message)
  return result.commit || ''
}

/**
 * Get the files at a specific commit.
 */
export async function getFilesAtCommit(
  repoPath: string,
  commitSha: string
): Promise<SkillFile[]> {
  const git = getGit(repoPath)
  const files: SkillFile[] = []

  try {
    // Get list of files at this commit
    const fileList = await git.raw(['ls-tree', '-r', '--name-only', commitSha])
    const filePaths = fileList.trim().split('\n').filter(Boolean)

    for (const filePath of filePaths) {
      const content = await git.show([`${commitSha}:${filePath}`])
      files.push({
        path: filePath,
        content,
        size: Buffer.byteLength(content, 'utf-8'),
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Expected: empty tree or missing commit
    if (!message.includes('Not a valid object name') && !message.includes('does not exist')) {
      console.error('Unexpected error reading files at commit:', err)
    }
  }

  return files
}

/**
 * Get diff between two commits.
 */
export async function diffVersions(
  repoPath: string,
  fromSha: string,
  toSha: string
): Promise<VersionDiff> {
  const git = getGit(repoPath)

  const diffResult = await git.diff([fromSha, toSha])
  const nameStatusResult = await git.raw(['diff', '--name-status', fromSha, toSha])

  const fileDiffs: FileDiff[] = []

  // Parse name-status output
  const statusLines = nameStatusResult.trim().split('\n').filter(Boolean)
  for (const line of statusLines) {
    const [status, ...pathParts] = line.split('\t')
    const filePath = pathParts.join('\t')

    let fileStatus: FileDiff['status'] = 'modified'
    if (status.startsWith('A')) fileStatus = 'added'
    else if (status.startsWith('D')) fileStatus = 'removed'

    // Get per-file diff
    let hunks = ''
    try {
      hunks = await git.diff([fromSha, toSha, '--', filePath])
    } catch {
      // File might not exist in one of the commits
    }

    fileDiffs.push({
      path: filePath,
      status: fileStatus,
      hunks,
    })
  }

  return {
    from: fromSha,
    to: toSha,
    files: fileDiffs,
  }
}

/**
 * List all commits (versions) on a branch.
 */
export async function listCommits(
  repoPath: string,
  branchName: string = 'main'
): Promise<Array<{
  sha: string
  message: string
  date: string
  author: string
}>> {
  const git = getGit(repoPath)

  try {
    const raw = await git.raw(['log', '--format=%H|%s|%aI|%an', branchName])
    if (!raw.trim()) return []
    return raw.trim().split('\n').map(line => {
      const [sha, message, date, author] = line.split('|')
      return { sha, message, date, author }
    })
  } catch {
    return []
  }
}

/**
 * Restore a previous version by creating a new commit with that version's files.
 */
export async function restoreVersion(
  repoPath: string,
  commitSha: string,
  branchName: string = 'main'
): Promise<string> {
  const files = await getFilesAtCommit(repoPath, commitSha)
  const message = `Restore version ${commitSha.slice(0, 8)}`
  return createVersion(repoPath, files, message, branchName)
}

/**
 * List branches in the repo.
 */
export async function listBranches(repoPath: string): Promise<string[]> {
  const git = getGit(repoPath)
  try {
    const branches = await git.branchLocal()
    return branches.all
  } catch {
    return []
  }
}

/**
 * Create a new branch from a commit.
 */
export async function createBranch(
  repoPath: string,
  branchName: string,
  fromCommit?: string
): Promise<void> {
  const git = getGit(repoPath)
  if (fromCommit) {
    await git.branch([branchName, fromCommit])
  } else {
    await git.branch([branchName])
  }
}

/**
 * Delete the git repo directory.
 */
export async function deleteSkillGitRepo(repoId: string): Promise<void> {
  const repoPath = path.join(config.skillReposPath, repoId)
  await fs.rm(repoPath, { recursive: true, force: true })
}
