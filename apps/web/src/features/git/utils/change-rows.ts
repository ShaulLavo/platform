import type { ChangeRow, FileStatus } from '@/features/git/utils/types'

/**
 * One status entry can produce two rows: a file staged and then edited again
 * shows up under both headings, which is what the panel renders.
 */
export function changeRows(files: readonly FileStatus[]) {
  const staged: ChangeRow[] = []
  const worktree: ChangeRow[] = []

  for (const file of sortedStatusFiles(files)) {
    if (isStagedStatus(file.index)) {
      staged.push({ file, section: 'staged', status: file.index })
    }
    if (isWorktreeStatus(file.worktree)) {
      worktree.push({ file, section: 'worktree', status: file.worktree })
    }
  }

  return { staged, worktree }
}

/**
 * An untracked file reports `index: 'untracked'` rather than `'unmodified'`,
 * so a bare inequality would count it as staged. Exported because the file
 * tree's row menu decides stage-vs-unstage from the same rule — two copies
 * would eventually disagree with the panel.
 */
export function isStagedStatus(status: FileStatus['index']) {
  return status !== 'unmodified' && status !== 'untracked'
}

export function isWorktreeStatus(status: FileStatus['worktree']) {
  return status !== 'unmodified'
}

function sortedStatusFiles(files: readonly FileStatus[]) {
  return files.toSorted(compareStatusPaths)
}

function compareStatusPaths(left: FileStatus, right: FileStatus) {
  if (left.path < right.path) return -1
  if (left.path > right.path) return 1

  return 0
}
