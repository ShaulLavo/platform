import type {
  GitFileDiff,
  GitFileStatus,
  GitRepositoryInfo,
  GitStatusResult,
  GitTreeStatus,
} from '@workspace/contracts'

export type TreeStatus = GitTreeStatus
export type FileStatus = GitFileStatus
export type RepositoryInfo = GitRepositoryInfo
export type StatusResult = GitStatusResult
export type FileDiff = GitFileDiff

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
