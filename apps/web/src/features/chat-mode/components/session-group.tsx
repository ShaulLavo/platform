import type { ThreadId } from '@workspace/contracts'
import type { ReactNode } from 'react'

import { SessionRow } from '@/features/chat-mode/components/session-row'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'
import { cn } from '@workspace/ui/lib/utils'

export function SessionGroup({
  action,
  activeThreadId,
  emphasized = false,
  emptyLabel,
  icon,
  label,
  qualifier,
  sessions,
  showProject = false,
  onSelect,
}: {
  readonly action?: ReactNode
  readonly activeThreadId: ThreadId | null
  readonly emphasized?: boolean
  readonly emptyLabel?: string
  readonly icon?: ReactNode
  readonly label: string
  /** Shown beside the label when another group carries the same one. */
  readonly qualifier?: string | null
  readonly sessions: readonly SessionRailItem[]
  readonly showProject?: boolean
  readonly onSelect: (session: SessionRailItem) => void
}) {
  return (
    <section className='group/group flex flex-col gap-0.5'>
      <div className='flex items-center gap-1 pt-3 pr-1 pb-1 pl-2'>
        <h2
          className={cn(
            'text-muted-foreground/80 flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-medium',
            emphasized && 'text-foreground',
          )}
          title={qualifier ? `${label} — ${qualifier}` : label}
        >
          {icon}
          <span className='truncate'>{label}</span>
          {qualifier ? (
            <span className='text-muted-foreground/60 shrink-0 truncate font-normal'>
              {qualifier}
            </span>
          ) : null}
        </h2>
        {action}
      </div>
      {sessions.length === 0 && emptyLabel ? (
        <p className='text-muted-foreground/60 px-2 py-1 text-[11px]'>{emptyLabel}</p>
      ) : null}
      {sessions.map((session) => (
        <SessionRow
          active={session.id === activeThreadId}
          key={session.id}
          session={session}
          showProject={showProject}
          onSelect={onSelect}
        />
      ))}
    </section>
  )
}
