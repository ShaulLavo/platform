import { defineErrorCatalog } from 'evlog'

export const worktreeRuntimeErrors = defineErrorCatalog('worktree', {
  UNAVAILABLE: {
    status: 409,
    message: 'The checkout is not available for this operation.',
    why: 'The registered checkout is missing, belongs to another repository, or is not ready.',
    fix: 'Refresh the worktree manager and resolve the checkout before retrying.',
  },
  NOT_GIT: {
    status: 409,
    message: 'This workspace does not support new Git worktrees.',
    why: 'The project is a directory without a Git repository.',
    fix: 'Send to the current workspace or initialize a Git repository.',
  },
  RECONFIRM: {
    status: 409,
    message: 'The checkout changed after the preview.',
    why: 'The confirmed checkout state no longer matches the filesystem or Git registration.',
    fix: 'Refresh the preview and confirm the current state.',
  },
  ACTIVE: {
    status: 409,
    message: 'A process still owns this checkout.',
    why: 'A provider or terminal has not positively ended.',
    fix: 'Stop the process and retry, or release the checkout for manual cleanup.',
  },
})
