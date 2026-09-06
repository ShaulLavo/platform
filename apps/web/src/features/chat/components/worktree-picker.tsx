import type { OrchestrationWorktreeShell, SessionWorktreeTarget } from '@workspace/contracts'
import { GitBranchIcon, GitForkIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'

export function WorktreePicker({
  base,
  target,
  onCurrent,
  onNew,
}: {
  readonly base: OrchestrationWorktreeShell
  readonly target: SessionWorktreeTarget
  readonly onCurrent: () => void
  readonly onNew: () => void
}) {
  const ready = base.lifecycle.state === 'ready'
  const capability = base.worktreeCreationCapability
  const reason = capability.allowed ? null : capability.reason

  return (
    <div className='flex flex-col gap-1 px-3 pb-2'>
      <div aria-label='Session worktree' className='flex flex-wrap gap-1' role='group'>
        <Button
          autoFocus
          aria-pressed={target.kind === 'current'}
          disabled={!ready}
          onClick={onCurrent}
          size='sm'
          variant={target.kind === 'current' ? 'secondary' : 'ghost'}
        >
          <GitBranchIcon data-icon='inline-start' />
          Send to current branch
        </Button>
        <Button
          aria-pressed={target.kind === 'new'}
          disabled={!capability.allowed}
          onClick={onNew}
          size='sm'
          variant={target.kind === 'new' ? 'secondary' : 'ghost'}
        >
          <GitForkIcon data-icon='inline-start' />
          New worktree
        </Button>
      </div>
      {reason ? (
        <p className='text-muted-foreground text-xs' role='status'>
          {reason === 'not-git'
            ? 'New worktrees require a Git repository.'
            : 'This checkout is not ready for a new session.'}
        </p>
      ) : null}
    </div>
  )
}
