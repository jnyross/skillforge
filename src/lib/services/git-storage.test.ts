import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  initSkillGitRepo,
  createVersion,
  getFilesAtCommit,
  readFiles,
  writeFiles,
  diffVersions,
  listCommits,
  restoreVersion,
  listBranches,
  createBranch,
  deleteSkillGitRepo,
  getGit,
} from './git-storage'

// Override config to use temp directory
let tmpDir: string
let originalEnv: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillforge-test-'))
  originalEnv = process.env.SKILL_REPOS_PATH
  process.env.SKILL_REPOS_PATH = tmpDir
})

afterEach(async () => {
  if (originalEnv !== undefined) {
    process.env.SKILL_REPOS_PATH = originalEnv
  } else {
    delete process.env.SKILL_REPOS_PATH
  }
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
})

describe('initSkillGitRepo', () => {
  it('creates a git repo directory', async () => {
    const repoPath = await initSkillGitRepo('test-repo-1')
    expect(repoPath).toContain('test-repo-1')

    const stat = await fs.stat(repoPath)
    expect(stat.isDirectory()).toBe(true)

    const gitDir = await fs.stat(path.join(repoPath, '.git'))
    expect(gitDir.isDirectory()).toBe(true)
  })
})

describe('writeFiles and readFiles', () => {
  it('writes and reads files correctly', async () => {
    const repoPath = await initSkillGitRepo('test-rw')

    const files = [
      { path: 'SKILL.md', content: '# Test Skill', size: 12 },
      { path: 'sub/helper.md', content: 'Helper content', size: 14 },
    ]

    await writeFiles(repoPath, files)

    const readResult = await readFiles(repoPath)
    expect(readResult.length).toBe(2)

    const skillMd = readResult.find(f => f.path === 'SKILL.md')
    expect(skillMd).toBeDefined()
    expect(skillMd!.content).toBe('# Test Skill')

    const helper = readResult.find(f => f.path === 'sub/helper.md')
    expect(helper).toBeDefined()
    expect(helper!.content).toBe('Helper content')
  })

  it('rejects absolute paths', async () => {
    const repoPath = await initSkillGitRepo('test-abs')
    await expect(
      writeFiles(repoPath, [{ path: '/etc/passwd', content: 'bad', size: 3 }])
    ).rejects.toThrow('Absolute file paths are not allowed')
  })

  it('rejects path traversal', async () => {
    const repoPath = await initSkillGitRepo('test-traversal')
    await expect(
      writeFiles(repoPath, [{ path: '../../../etc/passwd', content: 'bad', size: 3 }])
    ).rejects.toThrow('Path traversal detected')
  })
})

describe('createVersion', () => {
  it('creates an initial commit and returns sha', async () => {
    const repoPath = await initSkillGitRepo('test-version')

    const files = [
      { path: 'SKILL.md', content: '# My Skill\n\nDo things.', size: 22 },
    ]

    const sha = await createVersion(repoPath, files, 'Initial commit')
    expect(sha).toBeTruthy()
    expect(sha.length).toBeGreaterThan(5)
  })

  it('creates multiple versions', async () => {
    const repoPath = await initSkillGitRepo('test-multi')

    const sha1 = await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'Version 1', size: 9 }],
      'First version'
    )

    const sha2 = await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'Version 2', size: 9 }],
      'Second version'
    )

    expect(sha1).not.toBe(sha2)
  })
})

describe('getFilesAtCommit', () => {
  it('retrieves files at a specific commit', async () => {
    const repoPath = await initSkillGitRepo('test-files-at')

    const sha = await createVersion(
      repoPath,
      [
        { path: 'SKILL.md', content: '# Skill', size: 7 },
        { path: 'README.md', content: '# README', size: 8 },
      ],
      'Add files'
    )

    const files = await getFilesAtCommit(repoPath, sha)
    expect(files.length).toBe(2)
    expect(files.find(f => f.path === 'SKILL.md')!.content).toBe('# Skill')
    expect(files.find(f => f.path === 'README.md')!.content).toBe('# README')
  })

  it('returns old files when given an old commit', async () => {
    const repoPath = await initSkillGitRepo('test-old-files')

    const sha1 = await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'Old content', size: 11 }],
      'v1'
    )

    await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'New content', size: 11 }],
      'v2'
    )

    const oldFiles = await getFilesAtCommit(repoPath, sha1)
    expect(oldFiles[0].content).toBe('Old content')
  })
})

describe('diffVersions', () => {
  it('shows differences between commits', async () => {
    const repoPath = await initSkillGitRepo('test-diff')

    const sha1 = await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'Line 1\nLine 2\n', size: 14 }],
      'v1'
    )

    const sha2 = await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'Line 1\nLine 2 modified\nLine 3\n', size: 30 }],
      'v2'
    )

    const diff = await diffVersions(repoPath, sha1, sha2)
    expect(diff.from).toBe(sha1)
    expect(diff.to).toBe(sha2)
    expect(diff.files.length).toBeGreaterThan(0)
    expect(diff.files[0].path).toBe('SKILL.md')
    expect(diff.files[0].status).toBe('modified')
  })

  it('detects added and removed files', async () => {
    const repoPath = await initSkillGitRepo('test-diff-add-rm')

    const sha1 = await createVersion(
      repoPath,
      [{ path: 'file-a.md', content: 'A', size: 1 }],
      'v1'
    )

    const sha2 = await createVersion(
      repoPath,
      [{ path: 'file-b.md', content: 'B', size: 1 }],
      'v2'
    )

    const diff = await diffVersions(repoPath, sha1, sha2)
    const removed = diff.files.find(f => f.path === 'file-a.md')
    const added = diff.files.find(f => f.path === 'file-b.md')
    expect(removed).toBeDefined()
    expect(removed!.status).toBe('removed')
    expect(added).toBeDefined()
    expect(added!.status).toBe('added')
  })
})

describe('listCommits', () => {
  it('lists commits on a branch', async () => {
    const repoPath = await initSkillGitRepo('test-log')

    await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'v1', size: 2 }],
      'First commit'
    )

    await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'v2', size: 2 }],
      'Second commit'
    )

    const commits = await listCommits(repoPath, 'main')
    expect(commits.length).toBe(2)
    expect(commits[0].message).toBe('Second commit')
    expect(commits[1].message).toBe('First commit')
  })

  it('returns empty for nonexistent branch', async () => {
    const repoPath = await initSkillGitRepo('test-log-empty')
    const commits = await listCommits(repoPath, 'nonexistent')
    expect(commits).toEqual([])
  })
})

describe('restoreVersion', () => {
  it('restores a previous version', async () => {
    const repoPath = await initSkillGitRepo('test-restore')

    const sha1 = await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'Original', size: 8 }],
      'v1'
    )

    await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'Modified', size: 8 }],
      'v2'
    )

    const restoreSha = await restoreVersion(repoPath, sha1)
    expect(restoreSha).toBeTruthy()

    const restoredFiles = await getFilesAtCommit(repoPath, restoreSha)
    expect(restoredFiles[0].content).toBe('Original')
  })
})

describe('listBranches and createBranch', () => {
  it('lists branches after creation', async () => {
    const repoPath = await initSkillGitRepo('test-branches')

    await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'main content', size: 12 }],
      'init'
    )

    const beforeBranches = await listBranches(repoPath)
    expect(beforeBranches).toContain('main')

    await createBranch(repoPath, 'experiment')
    const afterBranches = await listBranches(repoPath)
    expect(afterBranches).toContain('main')
    expect(afterBranches).toContain('experiment')
  })

  it('creates branch from specific commit', async () => {
    const repoPath = await initSkillGitRepo('test-branch-from')

    const sha1 = await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'v1', size: 2 }],
      'v1'
    )

    await createVersion(
      repoPath,
      [{ path: 'SKILL.md', content: 'v2', size: 2 }],
      'v2'
    )

    await createBranch(repoPath, 'from-v1', sha1)
    const branches = await listBranches(repoPath)
    expect(branches).toContain('from-v1')

    // Verify the branch points to v1
    const git = getGit(repoPath)
    const branchSha = await git.revparse(['from-v1'])
    expect(branchSha.trim()).toBe(sha1)
  })
})

describe('deleteSkillGitRepo', () => {
  it('removes the repo directory', async () => {
    const repoPath = await initSkillGitRepo('test-delete')
    const stat = await fs.stat(repoPath)
    expect(stat.isDirectory()).toBe(true)

    await deleteSkillGitRepo('test-delete')

    await expect(fs.stat(repoPath)).rejects.toThrow()
  })
})
