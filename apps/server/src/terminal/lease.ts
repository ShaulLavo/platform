import type { WorktreeId } from '@workspace/contracts'

export type TerminalExecutionLease = {
  activate: () => Promise<void>
  terminate: () => Promise<void>
  end: () => Promise<void>
}

export type TerminalLeaseBoundary = {
  begin: (worktreeId: WorktreeId) => Promise<TerminalExecutionLease>
}
