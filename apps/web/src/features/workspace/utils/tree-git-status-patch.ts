import type { FileTreeGitStatusPatch } from '@workspace/tree'
import type { GitStatusEntry } from '@workspace/tree'

export function treeGitStatusPatch(
  previous: readonly GitStatusEntry[],
  next: readonly GitStatusEntry[],
): FileTreeGitStatusPatch | null {
  const previousByPath = gitStatusByPath(previous)
  const nextByPath = gitStatusByPath(next)
  const remove: string[] = []
  const set: GitStatusEntry[] = []

  for (const path of previousByPath.keys()) {
    if (nextByPath.has(path)) continue

    remove.push(path)
  }
  for (const [path, status] of nextByPath) {
    if (previousByPath.get(path) === status) continue

    set.push({ path, status })
  }

  if (remove.length === 0 && set.length === 0) return null

  return { remove, set }
}

function gitStatusByPath(entries: readonly GitStatusEntry[]) {
  const statusByPath = new Map<string, GitStatusEntry['status']>()
  for (const entry of entries) statusByPath.set(entry.path, entry.status)

  return statusByPath
}
