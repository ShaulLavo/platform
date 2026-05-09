import type {
  ChangeRow,
  FileStatus,
  RepositoryInfo,
  StatusPresentation,
} from "./types"

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
  if (status === "added") return { className: "text-emerald-500", label: "A" }
  if (status === "deleted") return { className: "text-destructive", label: "D" }
  if (status === "ignored")
    return { className: "text-muted-foreground", label: "I" }
  if (status === "renamed") return { className: "text-sky-500", label: "R" }
  if (status === "untracked")
    return { className: "text-emerald-500", label: "U" }
  if (status === "conflicted")
    return { className: "text-destructive", label: "!" }

  return { className: "text-amber-500", label: "M" }
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
  return [...files].sort((left, right) => left.path.localeCompare(right.path))
}
