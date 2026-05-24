import type { GitBranch } from './types'

export function parseBranches(output: string): GitBranch[] {
  const fields = output.split('\0').filter(Boolean)
  const branches: GitBranch[] = []

  for (let index = 0; index < fields.length; index += 4) {
    const name = fields[index]
    const marker = fields[index + 1]
    const upstream = fields[index + 2]
    const commit = fields[index + 3]
    if (!name || !commit) continue

    branches.push({
      commit,
      current: marker === '*',
      name,
      upstream: upstream || null,
    })
  }

  return branches
}
