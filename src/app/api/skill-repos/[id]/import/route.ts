import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createVersion } from '@/lib/services/git-storage'
import { parseSkillMd, estimateTokenCount, countLines } from '@/lib/services/skill-parser'
import { lintSkill } from '@/lib/validators/skill-linter'
import type { SkillFile } from '@/types/skill'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

/**
 * POST /api/skill-repos/:id/import — Import files into a skill repo
 *
 * Accepts either:
 * 1. JSON body with { files: SkillFile[], message?: string }
 * 2. multipart/form-data with a zip file upload (field name: "zipFile")
 * 3. JSON body with { folderPath: string, message?: string } to import from a local folder
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const contentType = request.headers.get('content-type') || ''

  let files: SkillFile[] = []
  let message = 'Import files'

  if (contentType.includes('multipart/form-data')) {
    // Handle zip file upload
    const formData = await request.formData()
    const zipFile = formData.get('zipFile') as File | null
    const msgField = formData.get('message') as string | null

    if (!zipFile) {
      return NextResponse.json({ error: 'zipFile field is required' }, { status: 400 })
    }

    if (msgField) {
      message = msgField
    }

    // Extract zip to temp directory
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillforge-import-'))
    try {
      const zipBuffer = Buffer.from(await zipFile.arrayBuffer())
      const zipPath = path.join(tmpDir, 'upload.zip')
      await fs.writeFile(zipPath, zipBuffer)

      // Use Node's built-in unzip (via child_process)
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      const extractDir = path.join(tmpDir, 'extracted')
      await fs.mkdir(extractDir, { recursive: true })
      await execAsync(`unzip -o "${zipPath}" -d "${extractDir}"`)

      // Find the root — if the zip has a single top-level directory, use that
      const topEntries = await fs.readdir(extractDir, { withFileTypes: true })
      let rootDir = extractDir
      if (topEntries.length === 1 && topEntries[0].isDirectory()) {
        rootDir = path.join(extractDir, topEntries[0].name)
      }

      files = await readFilesFromDir(rootDir)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  } else {
    // JSON body
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { files: jsonFiles, folderPath, message: jsonMessage } = body as {
      files?: SkillFile[]
      folderPath?: string
      message?: string
    }

    if (jsonMessage) {
      message = jsonMessage
    }

    if (folderPath && typeof folderPath === 'string') {
      // Import from local folder path
      const resolvedPath = path.resolve(folderPath)

      // Security: allowlist approach — only allow imports from a configured base directory
      const allowedBase = path.resolve(process.env.SKILL_IMPORT_BASE_PATH || './data/imports')
      if (!resolvedPath.startsWith(allowedBase + path.sep) && resolvedPath !== allowedBase) {
        return NextResponse.json(
          { error: `Import path must be under the configured import directory: ${allowedBase}` },
          { status: 403 }
        )
      }

      try {
        await fs.access(resolvedPath)
      } catch {
        return NextResponse.json(
          { error: `Folder not found: ${folderPath}` },
          { status: 404 }
        )
      }

      files = await readFilesFromDir(resolvedPath)
    } else if (Array.isArray(jsonFiles) && jsonFiles.length > 0) {
      files = jsonFiles
    } else {
      return NextResponse.json(
        { error: 'Provide files array, folderPath, or upload a zipFile' },
        { status: 400 }
      )
    }
  }

  if (files.length === 0) {
    return NextResponse.json(
      { error: 'No files found to import' },
      { status: 400 }
    )
  }

  // Create git commit
  const commitSha = await createVersion(
    repo.gitRepoPath,
    files,
    message,
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
      commitMessage: message,
      tokenCount: estimateTokenCount(totalContent),
      lineCount: countLines(totalContent),
      fileCount: files.length,
      isChampion: !parentVersion, // First version becomes champion
    },
  })

  // If first version, set as champion
  if (!parentVersion) {
    await prisma.skillRepo.update({
      where: { id: params.id },
      data: { currentChampionVersionId: version.id },
    })
  }

  // Run linting if SKILL.md exists
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

  return NextResponse.json({
    version,
    filesImported: files.length,
    fileList: files.map(f => f.path),
  }, { status: 201 })
}

/**
 * Read all files from a directory, excluding .git and common non-skill files.
 */
async function readFilesFromDir(dirPath: string): Promise<SkillFile[]> {
  const files: SkillFile[] = []
  const excludeDirs = new Set(['.git', 'node_modules', '.DS_Store', '__pycache__'])

  async function walk(dir: string, prefix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (excludeDirs.has(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isSymbolicLink()) {
        // Skip symlinks to prevent reading arbitrary files (zip symlink attack)
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
          // Skip binary files that can't be read as utf-8
        }
      }
    }
  }

  await walk(dirPath, '')
  return files
}
