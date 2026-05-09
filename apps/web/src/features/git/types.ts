export type TreeStatus =
  | "added"
  | "deleted"
  | "ignored"
  | "modified"
  | "renamed"
  | "untracked"

export type FileStatus = {
  path: string
  oldPath?: string
  index: TreeStatus | "unmodified" | "conflicted"
  worktree: TreeStatus | "unmodified" | "conflicted"
  status: TreeStatus | "conflicted"
}

export type RepositoryInfo = {
  branch: string | null
  commit: string | null
  ahead: number
  behind: number
  path: string
}

export type StatusResult = {
  repository: RepositoryInfo | null
  files: FileStatus[]
}

export type LineChange = {
  type: "added" | "deleted" | "context"
  oldLine: number | null
  newLine: number | null
  text: string
}

export type DiffHunk = {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  patch: string
  changes: LineChange[]
}

export type FileDiff = {
  path: string
  oldPath?: string
  oldFileMissing?: boolean
  newFileMissing?: boolean
  oldText?: string
  newText?: string
  staged: boolean
  patch: string
  hunks: DiffHunk[]
}

export type Branch = {
  current: boolean
  name: string
  upstream: string | null
  commit: string
}

export type BranchesResult = {
  repository: RepositoryInfo | null
  branches: Branch[]
}

export type PanelSection = "staged" | "worktree"

export type ChangeRow = {
  file: FileStatus
  section: PanelSection
  status: FileStatus["index"] | FileStatus["worktree"]
}

export type StatusPresentation = {
  className: string
  label: string
}
