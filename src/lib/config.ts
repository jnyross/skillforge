import path from 'path'

export const config = {
  skillReposPath: path.resolve(process.env.SKILL_REPOS_PATH || './data/skill-repos'),
}
