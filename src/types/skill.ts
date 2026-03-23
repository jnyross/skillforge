export interface SkillFrontmatter {
  name?: string
  description?: string
  'disable-model-invocation'?: boolean
  'allowed-tools'?: string[]
  [key: string]: unknown
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter
  body: string
  rawContent: string
  hasFrontmatter: boolean
}

export interface SkillFile {
  path: string
  content: string
  size: number
}

export interface SkillFolder {
  files: SkillFile[]
  skillMd: ParsedSkill | null
}

export interface LintIssue {
  severity: 'error' | 'warning' | 'info'
  category: string
  rule: string
  message: string
  file: string
  line?: number
  evidence: string
}

export interface LintReport {
  issues: LintIssue[]
  scorecard: ScorecardEntry[]
  passed: boolean
  errorCount: number
  warningCount: number
  infoCount: number
}

export interface ScorecardEntry {
  category: string
  rating: 'good' | 'fair' | 'poor' | 'unknown'
  evidence: string[]
}

export interface VersionDiff {
  from: string
  to: string
  files: FileDiff[]
}

export interface FileDiff {
  path: string
  status: 'added' | 'removed' | 'modified'
  hunks: string
}

export interface VersionMetadata {
  id: string
  skillRepoId: string
  branchName: string
  gitCommitSha: string
  parentVersionId: string | null
  commitMessage: string
  createdBy: string
  createdAt: Date
  tokenCount: number
  lineCount: number
  fileCount: number
  isChampion: boolean
  notes: string
}
