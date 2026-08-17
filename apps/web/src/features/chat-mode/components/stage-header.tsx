import { CaretRightIcon, GitBranchIcon } from '@phosphor-icons/react'

import { ContextUsageRing } from '@/features/chat/components/context-usage-ring'
import type { ContextUsage } from '@/features/chat/utils/context-usage'
import {
  threadStatusDotClass,
  threadStatusLabel,
  threadStatusTextClass,
  type ThreadStatus,
} from '@/features/chat/utils/thread-status'
import { BranchActions } from '@/features/git/components/branch-actions'
import { SessionRename } from '@/features/chat-mode/components/session-rename'
import { StageSessionMenu } from '@/features/chat-mode/components/stage-session-menu'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'
import { cn } from '@workspace/ui/lib/utils'

export function StageHeader({
  contextUsage,
  projectTitle,
  session,
}: {
  readonly contextUsage: ContextUsage | null
  readonly projectTitle: string | null
  /** Null while the stage is on the composer — there is no session to name or act on. */
  readonly session: SessionRailItem | null
}) {
  const { rootPath } = useChatModeSession()
  const renaming = useSessionRailStore((state) => state.renaming)
  const editing =
    Boolean(session) && renaming?.surface === 'header' && renaming.threadId === session?.id

  return (
    <header className='border-border/60 flex h-11 shrink-0 items-center gap-2 border-b px-3'>
      <nav aria-label='Session' className='flex min-w-0 flex-1 items-center gap-1.5 text-[12px]'>
        {projectTitle ? (
          <>
            <span className='text-muted-foreground max-w-[9rem] shrink-0 truncate'>
              {projectTitle}
            </span>
            <CaretRightIcon className='text-muted-foreground/50 size-3 shrink-0' />
          </>
        ) : null}
        {session?.branch ? (
          <>
            <span className='text-muted-foreground flex min-w-0 shrink items-center gap-1'>
              <GitBranchIcon className='size-3 shrink-0' />
              <span className='max-w-[9rem] truncate'>{session.branch}</span>
            </span>
            <CaretRightIcon className='text-muted-foreground/50 size-3 shrink-0' />
          </>
        ) : null}
        {session && editing ? (
          <SessionRename
            className='text-foreground h-7 min-w-0 flex-1 rounded-md px-2 text-[13px] font-medium'
            session={session}
          />
        ) : (
          <h1 className='min-w-0 flex-1 truncate font-medium'>{session?.title ?? 'New session'}</h1>
        )}
      </nav>
      {session?.branch ? (
        <BranchActions
          pullRequestTitle={session.title}
          // The session's worktree is its own checkout with its own HEAD, so the
          // project root would push whatever branch the main tree happens to be on.
          rootPath={session.worktreePath ?? rootPath}
        />
      ) : null}
      {session ? statusBadge(session.status) : null}
      {contextUsage ? <ContextUsageRing usage={contextUsage} /> : null}
      {session ? <StageSessionMenu session={session} /> : null}
    </header>
  )
}

function statusBadge(status: ThreadStatus) {
  if (status === 'idle') return null

  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 text-[11px]',
        threadStatusTextClass(status),
      )}
    >
      <span className={cn('size-1.5 rounded-full', threadStatusDotClass(status))} />
      {threadStatusLabel(status)}
    </span>
  )
}
