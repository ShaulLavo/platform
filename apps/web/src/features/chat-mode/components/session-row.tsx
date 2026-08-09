import { GitBranchIcon } from '@phosphor-icons/react'

import { formatChatDateLabel } from '@/features/chat/lib/chat-formatters'
import { threadStatusDotClass, threadStatusLabel } from '@/features/chat/lib/thread-status'
import { SessionMenu } from '@/features/chat-mode/components/session-menu'
import { SessionRename } from '@/features/chat-mode/components/session-rename'
import { useSessionRail } from '@/features/chat-mode/providers/rail-context'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'
import { cn } from '@workspace/ui/lib/utils'

export function SessionRow({
  active,
  session,
  showProject,
}: {
  readonly active: boolean
  readonly session: SessionRailItem
  /** Off when the list is already scoped to one project — the label would be noise. */
  readonly showProject: boolean
}) {
  const { openSession, renamingSessionId } = useSessionRail()

  if (renamingSessionId === session.id) return <SessionRename session={session} />

  return (
    <SessionMenu
      session={session}
      trigger={
        <button
          aria-current={active ? 'true' : undefined}
          className={cn(
            'group/session focus-visible:ring-ring/50 flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-1',
            // Hover material only when not selected: bg-accent already carries
            // --surface-opacity, so a /60 hover on top of it composites *lighter*.
            'text-muted-foreground',
            !active && 'hover:bg-accent hover:text-foreground',
            active && 'bg-accent text-accent-foreground',
          )}
          title={session.title}
          type='button'
          onClick={() => openSession(session)}
        >
          <span className='flex w-full min-w-0 items-center gap-2'>
            <span
              aria-label={threadStatusLabel(session.status)}
              className={cn('size-1.5 shrink-0 rounded-full', threadStatusDotClass(session.status))}
              role='status'
              title={threadStatusLabel(session.status)}
            />
            <span className='min-w-0 flex-1 truncate text-[13px] leading-5'>{session.title}</span>
            <span className='shrink-0 text-[10px] tabular-nums opacity-50'>
              {formatChatDateLabel(session.sortedAt)}
            </span>
          </span>
          {sessionMeta(session, showProject)}
        </button>
      }
    />
  )
}

function sessionMeta(session: SessionRailItem, showProject: boolean) {
  const project = showProject ? session.projectTitle : null
  if (!project && !session.branch) return null

  return (
    <span className='flex min-w-0 items-center gap-1.5 pl-[14px] text-[11px] leading-4 opacity-60'>
      {project ? <span className='max-w-[55%] truncate'>{project}</span> : null}
      {project && session.branch ? (
        <span aria-hidden className='opacity-50'>
          ·
        </span>
      ) : null}
      {session.branch ? (
        <>
          <GitBranchIcon className='size-3 shrink-0' />
          <span className='truncate'>{session.branch}</span>
        </>
      ) : null}
    </span>
  )
}
