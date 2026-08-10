import { defineErrorCatalog } from 'evlog'

export const gitWorktreeErrors = defineErrorCatalog('git', {
  WORKTREE_BASE_UNRESOLVED: {
    status: 404,
    message: ({ headBranch }: { headBranch: string }) =>
      `No base branch could be resolved for ${headBranch}`,
    why: 'The branch has no recorded base, the remote publishes no default branch, and neither main nor master exists, so there is nothing to diff the branch against.',
    fix: 'Pass an explicit base ref, or create/fetch the branch this one forked from.',
  },
  WORKTREE_BASE_NOT_FOUND: {
    status: 404,
    message: ({ base }: { base: string }) => `Base ref does not resolve to a commit: ${base}`,
    why: 'The caller named a base explicitly, but the repository has no such ref — usually a remote branch that was never fetched.',
    fix: 'Fetch the remote, or pick a base from the base-refs listing.',
  },
  WORKTREE_DIRTY: {
    status: 409,
    message: ({ fileCount, path }: { fileCount: number; path: string }) =>
      `Worktree ${path} has ${fileCount} uncommitted change(s)`,
    why: 'Removing the worktree would delete work that exists nowhere else: the files are modified or untracked and were never committed.',
    fix: 'Commit or discard the changes, or repeat the removal with force once the loss is intended.',
  },
  WORKTREE_MAIN_PROTECTED: {
    status: 400,
    message: ({ path }: { path: string }) => `${path} is the repository's main worktree`,
    why: 'The main worktree owns the object store every linked worktree reads from, so git itself refuses to remove it.',
    fix: 'Remove a session worktree instead; the main checkout is deleted by deleting the project.',
  },
  WORKTREE_NOT_FOUND: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `No worktree of this repository is checked out at ${path}`,
    why: 'Removal only ever targets a path git already reports as a worktree, so an unregistered path is refused rather than deleted from disk.',
    fix: 'List the worktrees and remove one of the paths it reports.',
  },
  WORKTREE_OUTSIDE_REPOSITORY: {
    status: 400,
    message: ({ path }: { path: string }) => `${path} is outside the repository root`,
    why: 'Worktree creation and removal are confined to the repository so a crafted session id or path cannot reach the rest of the filesystem.',
    fix: 'Use a session id without path separators, and remove externally created worktrees with git directly.',
  },
})
