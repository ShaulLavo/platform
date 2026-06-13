import type { GitRepositoryInfo } from '@workspace/contracts'

export type {
  GitBranch,
  GitBranchesResult,
  GitCommitResult,
  GitDiffHunk,
  GitFileDiff,
  GitFileStatus,
  GitLineChange,
  GitRepositoryInfo,
  GitStatusResult,
} from '@workspace/contracts'

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
