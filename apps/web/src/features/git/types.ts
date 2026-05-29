import type {
  GitBranch,
  GitBranchesResult,
  GitCommitResult,
  GitDiffHunk,
  GitFileDiff,
  GitFileStatus,
  GitLineChange,
  GitRepositoryInfo,
  GitStatusResult,
  GitTreeStatus,
} from '@workspace/contracts'

export type TreeStatus = GitTreeStatus
export type FileStatus = GitFileStatus
export type RepositoryInfo = GitRepositoryInfo
export type StatusResult = GitStatusResult
export type LineChange = GitLineChange
export type DiffHunk = GitDiffHunk
export type FileDiff = GitFileDiff
export type Branch = GitBranch
export type BranchesResult = GitBranchesResult
export type CommitResult = GitCommitResult

export type PanelSection = 'staged' | 'worktree'

export type BlobDiffRequest = {
  path: string
  oldPath?: string
  oldObjectId?: string
  newObjectId?: string
}

export type ChangeRow = {
  file: FileStatus
  section: PanelSection
  status: FileStatus['index'] | FileStatus['worktree']
}

export type StatusPresentation = {
  className: string
  label: string
  title: string
}
