/**
 * One record of `git worktree list --porcelain -z`, before it is mapped onto
 * workspace paths. `-z` is what makes this parseable at all: the newline form
 * quotes paths that contain odd bytes, the NUL form never does.
 */
export type ParsedWorktree = {
  absolutePath: string
  bare: boolean
  branch: string | null
  commit: string | null
  detached: boolean
  locked: boolean
  prunable: boolean
}

const BRANCH_PREFIX = 'refs/heads/'

/**
 * Attributes are NUL-separated and an empty field terminates a record, so the
 * whole listing is one flat scan: a `worktree` field opens the next record and
 * everything until the blank field describes it.
 */
export function parseWorktreeList(output: string): ParsedWorktree[] {
  const worktrees: ParsedWorktree[] = []
  let current: ParsedWorktree | null = null

  for (const field of output.split('\0')) {
    if (!field) {
      if (current) worktrees.push(current)
      current = null
      continue
    }
    if (field.startsWith('worktree ')) {
      if (current) worktrees.push(current)
      current = emptyWorktree(field.slice('worktree '.length))
      continue
    }
    if (!current) continue

    applyAttribute(current, field)
  }
  if (current) worktrees.push(current)

  return worktrees
}

function emptyWorktree(absolutePath: string): ParsedWorktree {
  return {
    absolutePath,
    bare: false,
    branch: null,
    commit: null,
    detached: false,
    locked: false,
    prunable: false,
  }
}

function applyAttribute(worktree: ParsedWorktree, field: string) {
  if (field.startsWith('HEAD ')) {
    worktree.commit = field.slice('HEAD '.length)
    return
  }
  if (field.startsWith('branch ')) {
    worktree.branch = shortBranchName(field.slice('branch '.length))
    return
  }
  // `locked` and `prunable` carry an optional reason after a space; the reason
  // is advice for a human, the flag is what a caller can act on.
  if (field === 'bare') worktree.bare = true
  if (field === 'detached') worktree.detached = true
  if (field === 'locked' || field.startsWith('locked ')) worktree.locked = true
  if (field === 'prunable' || field.startsWith('prunable ')) worktree.prunable = true
}

function shortBranchName(ref: string) {
  if (!ref.startsWith(BRANCH_PREFIX)) return ref

  return ref.slice(BRANCH_PREFIX.length)
}
