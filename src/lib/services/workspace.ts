import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'
import { getFilesAtCommit } from './git-storage'

const WORKSPACE_PREFIX = 'skillforge-workspace-'

/** Deny list for security: paths that must never be accessible in workspaces */
const DENIED_PATHS = [
  '~/.ssh',
  '.env',
  '.env.local',
  '.env.production',
  '~/.aws',
  '~/.gcloud',
  '~/.config/gcloud',
  '~/.azure',
]

/**
 * Create an isolated temp workspace with skill files materialized.
 * Used for eval execution — Claude runs inside this directory.
 */
export async function createWorkspace(options: {
  repoPath: string
  commitSha: string
  fixtures?: Array<{ path: string; content: string; type?: string }>
}): Promise<{ workspacePath: string; cleanup: () => Promise<void> }> {
  const workspaceId = uuid()
  const workspacePath = path.join(os.tmpdir(), `${WORKSPACE_PREFIX}${workspaceId}`)
  await fs.mkdir(workspacePath, { recursive: true })

  // Materialize skill files from the git commit
  const skillFiles = await getFilesAtCommit(options.repoPath, options.commitSha)
  const skillDir = path.join(workspacePath, '.skill')
  await fs.mkdir(skillDir, { recursive: true })

  for (const file of skillFiles) {
    const filePath = path.join(skillDir, file.path)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, file.content, 'utf-8')
  }

  // Materialize fixtures (test-specific files)
  if (options.fixtures) {
    for (const fixture of options.fixtures) {
      validatePath(fixture.path)
      const fixturePath = path.resolve(workspacePath, fixture.path)
      // Ensure it stays within workspace
      if (!fixturePath.startsWith(workspacePath)) {
        throw new Error(`Path traversal detected in fixture: ${fixture.path}`)
      }
      await fs.mkdir(path.dirname(fixturePath), { recursive: true })
      await fs.writeFile(fixturePath, fixture.content, 'utf-8')
    }
  }

  const cleanup = async () => {
    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch {
      // Best effort cleanup
    }
  }

  return { workspacePath, cleanup }
}

/**
 * Capture artifacts from a workspace after execution.
 * Collects all files created/modified during the run.
 */
export async function captureArtifacts(
  workspacePath: string,
  excludePatterns: string[] = ['.skill', '.git', 'node_modules']
): Promise<Array<{ name: string; type: string; content: string; path: string; sizeBytes: number }>> {
  const artifacts: Array<{ name: string; type: string; content: string; path: string; sizeBytes: number }> = []

  async function walk(dir: string, prefix: string) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (excludePatterns.includes(entry.name)) continue

      const fullPath = path.join(dir, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        await walk(fullPath, relativePath)
      } else {
        try {
          const stat = await fs.stat(fullPath)
          // Skip files over 5MB
          if (stat.size > 5 * 1024 * 1024) continue

          const content = await fs.readFile(fullPath, 'utf-8')
          artifacts.push({
            name: entry.name,
            type: inferArtifactType(entry.name),
            content,
            path: relativePath,
            sizeBytes: stat.size,
          })
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(workspacePath, '')
  return artifacts
}

/**
 * List all active workspaces (for debugging/cleanup).
 */
export async function listActiveWorkspaces(): Promise<string[]> {
  const tmpDir = os.tmpdir()
  const entries = await fs.readdir(tmpDir)
  return entries
    .filter(e => e.startsWith(WORKSPACE_PREFIX))
    .map(e => path.join(tmpDir, e))
}

/**
 * Clean up all stale workspaces.
 */
export async function cleanupStaleWorkspaces(maxAgeMs: number = 3600000): Promise<number> {
  const workspaces = await listActiveWorkspaces()
  let cleaned = 0
  const now = Date.now()

  for (const ws of workspaces) {
    try {
      const stat = await fs.stat(ws)
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.rm(ws, { recursive: true, force: true })
        cleaned++
      }
    } catch {
      // Already cleaned or inaccessible
    }
  }

  return cleaned
}

function validatePath(filePath: string): void {
  for (const denied of DENIED_PATHS) {
    if (filePath.includes(denied) || filePath.startsWith(denied)) {
      throw new Error(`Access denied: ${filePath} matches denied path pattern`)
    }
  }
  if (path.isAbsolute(filePath)) {
    throw new Error(`Absolute paths not allowed: ${filePath}`)
  }
}

function inferArtifactType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const typeMap: Record<string, string> = {
    '.json': 'json',
    '.md': 'file',
    '.txt': 'file',
    '.ts': 'file',
    '.js': 'file',
    '.py': 'file',
    '.sh': 'file',
    '.yaml': 'file',
    '.yml': 'file',
    '.toml': 'file',
    '.xml': 'file',
    '.html': 'file',
    '.css': 'file',
  }
  return typeMap[ext] ?? 'file'
}
