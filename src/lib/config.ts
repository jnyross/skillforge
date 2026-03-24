import path from 'path'

export const config = {
  skillReposPath: path.resolve(process.env.SKILL_REPOS_PATH || './data/skill-repos'),
  artifactsPath: path.resolve(process.env.ARTIFACTS_PATH || './data/artifacts'),
  defaultExecutor: process.env.DEFAULT_EXECUTOR || 'claude-cli',
  defaultModel: process.env.DEFAULT_MODEL || 'claude-opus-4-6',
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '1', 10),
}
