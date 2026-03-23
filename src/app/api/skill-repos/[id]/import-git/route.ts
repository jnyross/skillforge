import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createVersion, getGit } from '@/lib/services/git-storage'
import { parseSkillMd, estimateTokenCount, countLines } from '@/lib/services/skill-parser'
import { lintSkill } from '@/lib/validators/skill-linter'
import type { SkillFile } from '@/types/skill'
import simpleGit from 'simple-git'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

/**
 * POST /api/skill-repos/:id/import-git — Import from a git URL
 *
 * Body: { url: string, message?: string, branch?: string, subfolder?: string }
 *
 * Clones the repo to a temp directory, reads files (optionally from a subfolder),
 * and imports them as a new version.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url, message, branch, subfolder } = body as {
    url: string
    message?: string
    branch?: string
    subfolder?: string
  }

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  // Validate URL format (basic check for git-like URLs)
  const validUrlPattern = /^(https?:\/\/|git@|ssh:\/\/)/
  if (!validUrlPattern.test(url)) {
    return NextResponse.json(
      { error: 'url must be a valid git URL (https://, git@, or ssh://)' },
      { status: 400 }
    )
  }

  // Create import log
  const importLog = await prisma.gitImportLog.create({
    data: {
      skillRepoId: params.id,
      sourceUrl: url,
      status: 'cloning',
    },
  })

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillforge-git-import-'))
  let previousHead: string | undefined

  try {
    // Clone the repository using simple-git (safe from shell injection)
    const git = simpleGit()
    const cloneOpts = ['--depth', '1']
    if (branch) {
      cloneOpts.push('--branch', branch)
    }

    try {
      await git.clone(url, path.join(tmpDir, 'repo'), cloneOpts)
    } catch (cloneErr) {
      const errMsg = cloneErr instanceof Error ? cloneErr.message : String(cloneErr)
      await prisma.gitImportLog.update({
        where: { id: importLog.id },
        data: { status: 'failed', error: `Clone failed: ${errMsg}`, completedAt: new Date() },
      })
      return NextResponse.json(
        { error: `Failed to clone repository: ${errMsg}` },
        { status: 400 }
      )
    }

    // Update status
    await prisma.gitImportLog.update({
      where: { id: importLog.id },
      data: { status: 'importing' },
    })

    // Determine root directory for reading files
    let readDir = path.join(tmpDir, 'repo')
    if (subfolder) {
      const subPath = path.resolve(readDir, subfolder)
      // Security: ensure subfolder doesn't escape repo dir
      if (!subPath.startsWith(readDir + path.sep) && subPath !== readDir) {
        await prisma.gitImportLog.update({
          where: { id: importLog.id },
          data: { status: 'failed', error: 'Path traversal in subfolder', completedAt: new Date() },
        })
        return NextResponse.json(
          { error: 'subfolder must not escape the repository directory' },
          { status: 400 }
        )
      }
      readDir = subPath
    }

    // Read files from the cloned repo
    const files = await readFilesFromDir(readDir)

    if (files.length === 0) {
      await prisma.gitImportLog.update({
        where: { id: importLog.id },
        data: { status: 'failed', error: 'No files found', completedAt: new Date() },
      })
      return NextResponse.json({ error: 'No files found in the cloned repository' }, { status: 400 })
    }

    const commitMessage = message || `Import from ${url}`

    // Capture current HEAD for compensation on failure
    const internalGit = getGit(repo.gitRepoPath)
    try {
      previousHead = (await internalGit.revparse(['HEAD'])).trim()
    } catch {
      // No commits yet
    }

    // Create git commit in internal repo
    const commitSha = await createVersion(
      repo.gitRepoPath,
      files,
      commitMessage,
      repo.defaultBranch
    )

    const totalContent = files.map(f => f.content).join('\n')

    // Find parent version
    const parentVersion = await prisma.skillVersion.findFirst({
      where: { skillRepoId: params.id, branchName: repo.defaultBranch },
      orderBy: { createdAt: 'desc' },
    })

    // Create version record
    const version = await prisma.skillVersion.create({
      data: {
        skillRepoId: params.id,
        branchName: repo.defaultBranch,
        gitCommitSha: commitSha,
        parentVersionId: parentVersion?.id || null,
        commitMessage,
        tokenCount: estimateTokenCount(totalContent),
        lineCount: countLines(totalContent),
        fileCount: files.length,
        isChampion: !parentVersion,
      },
    })

    if (!parentVersion) {
      await prisma.skillRepo.update({
        where: { id: params.id },
        data: { currentChampionVersionId: version.id },
      })
    }

    // Run linting
    const skillMdFile = files.find(f => f.path === 'SKILL.md')
    if (skillMdFile) {
      const parsedSkill = parseSkillMd(skillMdFile.content)
      const lintReport = lintSkill(parsedSkill, files, repo.slug)

      if (lintReport.issues.length > 0) {
        await prisma.lintResult.createMany({
          data: lintReport.issues.map(issue => ({
            skillRepoId: params.id,
            skillVersionId: version.id,
            severity: issue.severity,
            category: issue.category,
            rule: issue.rule,
            message: issue.message,
            file: issue.file,
            line: issue.line,
            evidence: issue.evidence,
          })),
        })
      }
    }

    // Update import log
    await prisma.gitImportLog.update({
      where: { id: importLog.id },
      data: {
        status: 'completed',
        skillVersionId: version.id,
        completedAt: new Date(),
      },
    })

    return NextResponse.json({
      version,
      filesImported: files.length,
      fileList: files.map(f => f.path),
      importLog: { id: importLog.id, status: 'completed' },
    }, { status: 201 })
  } catch (err) {
    // Compensate: reset git branch to previous HEAD
    if (previousHead) {
      try {
        const internalGit = getGit(repo.gitRepoPath)
        await internalGit.reset(['--hard', previousHead])
      } catch (resetErr) {
        console.error('Failed to reset git HEAD after DB error:', resetErr)
      }
    }
    const errMsg = err instanceof Error ? err.message : String(err)
    await prisma.gitImportLog.update({
      where: { id: importLog.id },
      data: { status: 'failed', error: errMsg, completedAt: new Date() },
    }).catch(() => {})
    throw err
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Read all files from a directory, excluding .git and common non-skill files.
 */
async function readFilesFromDir(dirPath: string): Promise<SkillFile[]> {
  const files: SkillFile[] = []
  const excludeDirs = new Set(['.git', 'node_modules', '.DS_Store', '__pycache__', '.venv', 'venv'])

  async function walk(dir: string, prefix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (excludeDirs.has(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isSymbolicLink()) {
        continue
      } else if (entry.isDirectory()) {
        await walk(fullPath, relativePath)
      } else {
        try {
          const content = await fs.readFile(fullPath, 'utf-8')
          files.push({
            path: relativePath,
            content,
            size: Buffer.byteLength(content, 'utf-8'),
          })
        } catch {
          // Skip binary files
        }
      }
    }
  }

  await walk(dirPath, '')
  return files
}
