import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFilesAtCommit } from '@/lib/services/git-storage'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

/**
 * GET /api/skill-repos/:id/export/:versionId — Export a version's files
 *
 * Query params:
 *   format=zip — returns a zip file download
 *   (default) — returns JSON with file contents
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  const repo = await prisma.skillRepo.findUnique({ where: { id: params.id } })
  if (!repo) {
    return NextResponse.json({ error: 'Skill repo not found' }, { status: 404 })
  }

  const version = await prisma.skillVersion.findUnique({
    where: { id: params.versionId, skillRepoId: params.id },
  })
  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  const files = await getFilesAtCommit(repo.gitRepoPath, version.gitCommitSha)

  const format = request.nextUrl.searchParams.get('format')

  if (format === 'zip') {
    // Create a zip file and return it
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillforge-export-'))
    try {
      const skillDir = path.join(tmpDir, repo.slug)
      await fs.mkdir(skillDir, { recursive: true })

      // Write all files to temp directory
      for (const file of files) {
        const filePath = path.join(skillDir, file.path)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, file.content, 'utf-8')
      }

      // Create zip
      const zipPath = path.join(tmpDir, `${repo.slug}.zip`)
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      await execAsync(`cd "${tmpDir}" && zip -r "${zipPath}" "${repo.slug}"`)

      const zipBuffer = await fs.readFile(zipPath)

      return new NextResponse(zipBuffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${repo.slug}-${version.gitCommitSha.slice(0, 8)}.zip"`,
        },
      })
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  // Default: JSON response
  return NextResponse.json({
    repo: {
      slug: repo.slug,
      displayName: repo.displayName,
    },
    version: {
      id: version.id,
      commitSha: version.gitCommitSha,
      message: version.commitMessage,
      createdAt: version.createdAt,
    },
    files,
  })
}
