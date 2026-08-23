import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react'

import { threadStatusDotClass, threadStatusLabel } from '@/features/chat/utils/thread-status'
import { ProjectMenu } from '@/features/chat-mode/components/project-menu'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import type { SessionRailGroup } from '@/features/chat-mode/utils/session-rail-model'
import { cn } from '@workspace/ui/lib/utils'

/**
 * A project's band in the rail. Folded shut it still has to answer the two questions the
 * rows underneath were answering — is anything in here working or stuck, and is anything
 * new — so the rollup dot and the unread count live on the header, not in the list.
 *
 * It is also the band's drag handle, which is what keeps a folded project
 * movable: its rows are gone, but the header it folded into is still there.
 *
 * The drag props are optional because this same header is what the drag overlay
 * renders as the floating preview, where there is nothing to grab — the context
 * menu rides along there too, inert under the overlay's pointer-events-none.
 */
export function SessionGroupHeader({
  dragAttributes,
  dragListeners,
  group,
}: {
  readonly dragAttributes?: DraggableAttributes
  readonly dragListeners?: DraggableSyntheticListeners
  readonly group: SessionRailGroup
}) {
  const toggleProjectCollapsed = useSessionRailStore((state) => state.toggleProjectCollapsed)
  const { project } = group

  return (
    <ProjectMenu
      group={group}
      trigger={
        <button
          {...dragAttributes}
          {...dragListeners}
          aria-expanded={!group.collapsed}
          className='text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 compact:gap-1 compact:px-1.5 flex w-full touch-none items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] font-medium outline-none focus-visible:ring-1'
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
          <span className='text-muted-foreground/60 shrink-0 tabular-nums'>
            {project.sessionCount}
          </span>
        </button>
      }
    />
  )
}
