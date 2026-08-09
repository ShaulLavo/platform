import { CaretRightIcon, GitBranchIcon } from '@phosphor-icons/react'

import { ContextUsageRing } from '@/features/chat/components/context-usage-ring'
import type { ContextUsage } from '@/features/chat/lib/context-usage'
import {
  threadStatusDotClass,
  threadStatusLabel,
  threadStatusTextClass,
  type ThreadStatus,
} from '@/features/chat/lib/thread-status'
import { cn } from '@workspace/ui/lib/utils'

export function StageHeader({
  branch,
  contextUsage,
  projectTitle,
  status,
  title,
}: {
  readonly branch: string | null
  readonly contextUsage: ContextUsage | null
  readonly projectTitle: string | null
  /** Null while the stage is on the composer — there is no session to have a status. */
  readonly status: ThreadStatus | null
  readonly title: string
}) {
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
        {branch ? (
          <>
            <span className='text-muted-foreground flex min-w-0 shrink items-center gap-1'>
              <GitBranchIcon className='size-3 shrink-0' />
              <span className='max-w-[9rem] truncate'>{branch}</span>
            </span>
            <CaretRightIcon className='text-muted-foreground/50 size-3 shrink-0' />
          </>
        ) : null}
        <h1 className='min-w-0 flex-1 truncate font-medium'>{title}</h1>
      </nav>
      {status ? statusBadge(status) : null}
      {contextUsage ? <ContextUsageRing usage={contextUsage} /> : null}
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
