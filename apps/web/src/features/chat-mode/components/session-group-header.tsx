import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react'

import { threadStatusDotClass, threadStatusLabel } from '@/features/chat/lib/thread-status'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import type { SessionRailGroup } from '@/features/chat-mode/utils/session-rail-model'
import { cn } from '@workspace/ui/lib/utils'

/**
 * A project's band in the rail. Folded shut it still has to answer the two questions the
 * rows underneath were answering — is anything in here working or stuck, and is anything
 * new — so the rollup dot and the unread count live on the header, not in the list.
 */
export function SessionGroupHeader({ group }: { readonly group: SessionRailGroup }) {
  const toggleProjectCollapsed = useSessionRailStore((state) => state.toggleProjectCollapsed)
  const { project } = group

  return (
    <button
      aria-expanded={!group.collapsed}
      className='text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] font-medium outline-none focus-visible:ring-1'
      title={project.workspaceRoot}
      type='button'
      onClick={() => toggleProjectCollapsed(project.id)}
    >
      {group.collapsed ? (
        <CaretRightIcon className='size-3 shrink-0 opacity-60' />
      ) : (
        <CaretDownIcon className='size-3 shrink-0 opacity-60' />
      )}
      <span
        aria-label={threadStatusLabel(project.status)}
        className={cn('size-1.5 shrink-0 rounded-full', threadStatusDotClass(project.status))}
        role='status'
        title={threadStatusLabel(project.status)}
      />
      <span className='min-w-0 flex-1 truncate'>{project.title}</span>
      {project.qualifier ? (
        <span className='text-muted-foreground/60 max-w-[40%] shrink-0 truncate font-normal'>
          {project.qualifier}
        </span>
      ) : null}
      {project.unreadCount > 0 ? (
        <span className='text-info shrink-0 tabular-nums' title='Unread sessions'>
          {project.unreadCount}
        </span>
      ) : null}
      <span className='text-muted-foreground/60 shrink-0 tabular-nums'>{project.sessionCount}</span>
    </button>
  )
}
