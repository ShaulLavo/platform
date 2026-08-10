import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GitBranchIcon } from '@phosphor-icons/react'

import { formatChatRelativeTime } from '@/features/chat/lib/chat-formatters'
import { useCoarseNow } from '@/features/chat/hooks/use-coarse-now'
import { threadStatusDotClass, threadStatusLabel } from '@/features/chat/lib/thread-status'
import { SessionMenu } from '@/features/chat-mode/components/session-menu'
import { SessionRename } from '@/features/chat-mode/components/session-rename'
import { SessionRowSnippet } from '@/features/chat-mode/components/session-row-snippet'
import { activateSessionRow } from '@/features/chat-mode/state/session-commands'
import { useSessionMultiSelectStore } from '@/features/chat-mode/state/session-multi-select-store'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { sessionClickIntent } from '@/features/chat-mode/utils/session-multi-select'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'
import { cn } from '@workspace/ui/lib/utils'

export function SessionRow({
  active,
  session,
}: {
  readonly active: boolean
  readonly session: SessionRailItem
}) {
  // Subscribed rather than read in render: an in-render `Date.now()` is frozen
  // by the React Compiler's memo scope, which would leave every idle row's
  // label stuck at whatever it said when the row mounted.
  const nowMs = useCoarseNow()
  const renaming = useSessionRailStore((state) => state.renaming)
  const marked = useSessionMultiSelectStore((state) => state.threadIds.includes(session.id))
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    attributes: {
      roleDescription: 'sortable session row',
    },
    id: session.id,
  })

  if (renaming?.surface === 'rail' && renaming.threadId === session.id) {
    return (
      <SessionRename
        className='bg-accent text-foreground h-auto rounded-md border-transparent px-2 py-1.5 text-[13px] leading-5'
        session={session}
      />
    )
  }

  return (
    <SessionMenu
      session={session}
      trigger={
        <button
          {...attributes}
          {...listeners}
          aria-current={active ? 'true' : undefined}
          className={cn(
            'group/session focus-visible:ring-ring/50 flex w-full touch-none flex-col gap-1 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-1',
            // Hover material only when not selected: bg-accent already carries
            // --surface-opacity, so a /60 hover on top of it composites *lighter*.
            'text-muted-foreground',
            !active && !marked && 'hover:bg-accent hover:text-foreground',
            active && 'bg-accent text-accent-foreground',
            // A marked row is not the row on the stage, so it gets a ring rather than
            // the fill — the two states have to be readable at the same time.
            marked && !active && 'ring-ring/40 text-foreground ring-1',
            marked && active && 'ring-ring/60 ring-1',
            isDragging && 'relative z-10 opacity-60',
          )}
          data-marked={marked ? 'true' : undefined}
          ref={setNodeRef}
          // Measured drag offsets: nothing but the drag itself knows these values.
          style={{ transform: CSS.Transform.toString(transform), transition }}
          title={session.title}
          type='button'
          onClick={(event) => activateSessionRow(session, sessionClickIntent(event))}
        >
          <span className='flex w-full min-w-0 items-center gap-2'>
            <span
              aria-label={threadStatusLabel(session.status)}
              className={cn('size-1.5 shrink-0 rounded-full', threadStatusDotClass(session.status))}
              role='status'
              title={threadStatusLabel(session.status)}
            />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[13px] leading-5',
                session.unread && !active && 'text-foreground font-medium',
              )}
            >
              {session.title}
            </span>
            {session.unread ? (
              <span
                aria-label='Unread'
                className='bg-info size-1.5 shrink-0 rounded-full'
                role='status'
                title='Finished since you last opened it'
              />
            ) : null}
            <span className='shrink-0 text-[10px] tabular-nums opacity-50'>
              {formatChatRelativeTime(session.activityAt, nowMs)}
            </span>
          </span>
          {sessionBranch(session)}
          <SessionRowSnippet threadId={session.id} />
        </button>
      }
    />
  )
}

/** The project name lives on the group header now, so the row only carries the branch. */
function sessionBranch(session: SessionRailItem) {
  if (!session.branch) return null

  return (
    <span className='flex min-w-0 items-center gap-1.5 pl-[14px] text-[11px] leading-4 opacity-60'>
      <GitBranchIcon className='size-3 shrink-0' />
      <span className='truncate'>{session.branch}</span>
    </span>
  )
}
