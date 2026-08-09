import { GitBranchIcon } from '@phosphor-icons/react'

import { formatChatDateLabel } from '@/features/chat/lib/chat-formatters'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'
import { cn } from '@workspace/ui/lib/utils'

export function SessionRow({
  active,
  session,
  showProject = false,
  onSelect,
}: {
  readonly active: boolean
  readonly session: SessionRailItem
  readonly showProject?: boolean
  readonly onSelect: (session: SessionRailItem) => void
}) {
  const meta = showProject ? session.projectTitle : session.branch

  return (
    <button
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group/session focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-1',
        // Hover material only when not selected: bg-accent already carries
        // --surface-opacity, so a /60 hover on top of it composites *lighter*.
        'text-muted-foreground',
        !active && 'hover:bg-accent hover:text-foreground',
        active && 'bg-accent text-accent-foreground',
      )}
      title={session.title}
      type='button'
      onClick={() => onSelect(session)}
    >
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-[13px] leading-5'>{session.title}</span>
        {meta ? (
          <span className='flex min-w-0 items-center gap-1 text-[11px] leading-4 opacity-70'>
            {showProject ? null : <GitBranchIcon className='size-3 shrink-0' />}
            <span className='truncate'>{meta}</span>
          </span>
        ) : null}
      </span>
      {sessionStatusIndicator(session)}
    </button>
  )
}

function sessionStatusIndicator(session: SessionRailItem) {
  if (session.running) {
    return (
      <span
        aria-label='Working'
        className='bg-info size-1.5 shrink-0 animate-pulse rounded-full'
        role='status'
        title='Working'
      />
    )
  }
  if (session.attention) {
    return (
      <span
        aria-label='Waiting for you'
        className='bg-warning size-1.5 shrink-0 rounded-full'
        role='status'
        title='Waiting for you'
      />
    )
  }

  return (
    <span className='shrink-0 text-[10px] tabular-nums opacity-0 group-hover/session:opacity-60'>
      {formatChatDateLabel(session.sortedAt)}
    </span>
  )
}
