import type { GitBranch } from './types'

export function parseBranches(output: string): GitBranch[] {
  const branches: GitBranch[] = []

  for (const line of output.split(/\r?\n/)) {
    // Empty fields are meaningful (a branch without an upstream), so split
    // per line and keep them instead of filtering across the whole output.
    const [name, marker, upstream, commit] = line.split('\0')
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
