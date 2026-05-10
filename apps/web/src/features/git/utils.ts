import type {
  ChangeRow,
  FileStatus,
  RepositoryInfo,
  StatusPresentation,
} from "./types"
import { gitChangeSymbol } from "./status-symbols"

export function changeRows(files: readonly FileStatus[]) {
  const staged: ChangeRow[] = []
  const worktree: ChangeRow[] = []

  for (const file of sortedStatusFiles(files)) {
    if (isStagedStatus(file.index)) {
      staged.push({ file, section: "staged", status: file.index })
    }
    if (isWorktreeStatus(file.worktree)) {
      worktree.push({ file, section: "worktree", status: file.worktree })
    }
  }

  return { staged, worktree }
}

export function statusPresentation(
  status: FileStatus["index"] | FileStatus["worktree"]
): StatusPresentation {
  return gitChangeSymbol(status)
}

export function parentPath(path: string) {
  const index = path.lastIndexOf("/")
  if (index < 0) return ""

  return path.slice(0, index)
}

export function aheadBehindLabel(repository: RepositoryInfo) {
  const parts: string[] = []
  if (repository.ahead > 0) parts.push(`↑${repository.ahead}`)
  if (repository.behind > 0) parts.push(`↓${repository.behind}`)
  if (parts.length === 0) return ""

  return parts.join(" ")
}

function isStagedStatus(status: FileStatus["index"]) {
  return status !== "unmodified" && status !== "untracked"
}

function isWorktreeStatus(status: FileStatus["worktree"]) {
  return status !== "unmodified"
}

function sortedStatusFiles(files: readonly FileStatus[]) {
  return [...files].sort(compareStatusPaths)
}

function compareStatusPaths(left: FileStatus, right: FileStatus) {
  if (left.path < right.path) return -1
  if (left.path > right.path) return 1
  return 0
}
