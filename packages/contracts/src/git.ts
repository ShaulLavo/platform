/**
 * Git request/response DTOs that cross the server↔web boundary. Both
 * apps/server and apps/web consume these shared definitions rather than
 * maintaining parallel copies.
 */

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

/**
 * A commit reported as it happens, because a commit runs the repository's
 * hooks: a forty-second pre-commit hook and a wedged one look identical while
 * the only signal is a button that has not come back yet.
 *
 * `progress` frames carry hook output verbatim, tagged with the pipe they came
 * from — hooks conventionally write status to stderr and that is not an error.
 */
export type GitCommitProgressEvent =
  | { kind: 'progress'; stream: 'stderr' | 'stdout'; text: string }
  | { kind: 'result'; result: GitCommitResult }
  | { kind: 'failed'; message: string }

/**
 * One entry of `git worktree list`. Both paths are carried because they answer
 * different questions: `path` is what every other git route speaks, while
 * `absolutePath` is what a session's agent process is spawned with.
 */
export type GitWorktree = {
  absolutePath: string
  branch: string | null
  commit: string | null
  detached: boolean
  locked: boolean
  /** The repository's own checkout. It backs every linked worktree, so it is never removable. */
  main: boolean
  /** Workspace-relative path, or null when the worktree sits outside the workspace. */
  path: string | null
  prunable: boolean
  /** The session that owns this worktree, or null for one a human made by hand. */
  sessionId: string | null
}

export type GitWorktreeCreateResult = {
  /** False when the session already had a worktree and this call re-used it. */
  created: boolean
  worktree: GitWorktree
}

export type GitWorktreeRemoveResult = {
  removed: GitWorktree
  worktrees: GitWorktree[]
}

/**
 * A base a branch can be compared against. Local and remote are paired so the
 * picker offers `main` once instead of twice, while still remembering that the
 * comparison should run against `origin/main` when the remote is ahead.
 */
export type GitBaseRefChoice = {
  id: string
  label: string
  local: string | null
  remote: string | null
}

export type GitBaseRefChoicesResult = {
  choices: GitBaseRefChoice[]
  /** The choice a branch diff picks when the caller names no base. */
  defaultChoiceId: string | null
}

export type GitBranchDiffResult = {
  /** The base after the selection rules ran — never the raw request. */
  baseRef: string
  files: GitFileDiff[]
  headRef: string
  /** Where the branch left the base; null when the two share no history. */
  mergeBase: string | null
}
