import type { ThreadId } from '@workspace/contracts'

import { SessionGroupHeader } from '@/features/chat-mode/components/session-group-header'
import { SessionRow } from '@/features/chat-mode/components/session-row'
import type { SessionRailGroup } from '@/features/chat-mode/utils/session-rail-model'

export function SessionGroup({
  activeThreadId,
  group,
}: {
  readonly activeThreadId: ThreadId | null
  readonly group: SessionRailGroup
}) {
  return (
    <div className='flex flex-col gap-0.5'>
      <SessionGroupHeader group={group} />
      {group.sessions.map((session) => (
        <SessionRow active={session.id === activeThreadId} key={session.id} session={session} />
      ))}
      {/* Said out loud: a fold that silently swallows rows leaves the counts in the
          header looking wrong to anyone reading the list under it. */}
      {group.hiddenCount > 0 ? (
        <p className='text-muted-foreground/50 px-2 pb-1 pl-[26px] text-[11px] tabular-nums'>
          {group.hiddenCount} hidden
        </p>
      ) : null}
    </div>
  )
}
