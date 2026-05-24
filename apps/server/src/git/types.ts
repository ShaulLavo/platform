export type GitTreeStatus = 'added' | 'deleted' | 'ignored' | 'modified' | 'renamed' | 'untracked'

export type GitFileStatus = {
  path: string
  oldPath?: string
  index: GitTreeStatus | 'unmodified' | 'conflicted'
  worktree: GitTreeStatus | 'unmodified' | 'conflicted'
  status: GitTreeStatus | 'conflicted'
}

export type GitRepositoryInfo = {
  branch: string | null
  commit: string | null
  ahead: number
  behind: number
  path: string
}

export type GitStatusResult = {
  repository: GitRepositoryInfo | null
  files: GitFileStatus[]
}

export type GitLineChange = {
  type: 'added' | 'deleted' | 'context'
  oldLine: number | null
  newLine: number | null
  text: string
}

export type GitDiffHunk = {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  patch: string
  changes: GitLineChange[]
}

export type GitFileDiff = {
  path: string
  oldPath?: string
  oldFileMissing?: boolean
  newFileMissing?: boolean
  oldObjectId?: string
  newObjectId?: string
  oldText?: string
  newText?: string
  staged: boolean
  patch: string
  hunks: GitDiffHunk[]
}

export type GitBranch = {
  current: boolean
  name: string
  upstream: string | null
  commit: string
}

export type GitBranchesResult = {
  repository: GitRepositoryInfo | null
  branches: GitBranch[]
}

export type GitCommitResult =
  | {
      kind: 'committed'
      output: string
      repository: GitRepositoryInfo
    }
  | {
      kind: 'message-file'
      path: string
      repository: GitRepositoryInfo
    }

export type GitCommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export type GitRepository = {
  rootAbsolutePath: string
  rootDisplayAbsolutePath: string
  rootPath: string
  pathspec: string | null
  info: GitRepositoryInfo
}
