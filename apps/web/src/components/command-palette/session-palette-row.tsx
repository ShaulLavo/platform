import { GitBranchIcon } from '@phosphor-icons/react'
import { CommandItem, CommandShortcut } from '@workspace/ui/components/command'
import { cn } from '@workspace/ui/lib/utils'

import { useCommandPaletteActions } from '@/components/command-palette/hooks/use-command-palette-actions'
import {
  sessionItemValue,
  sessionPaletteKeywords,
} from '@/components/command-palette/command-palette-utils'
import { formatChatRelativeTime } from '@/features/chat/lib/chat-formatters'
import { useCoarseNow } from '@/features/chat/hooks/use-coarse-now'
import { threadStatusDotClass, threadStatusLabel } from '@/features/chat/lib/thread-status'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'

export function SessionPaletteRow({ session }: { readonly session: SessionRailItem }) {
  const { selectSession } = useCommandPaletteActions()
  // The same recency story the rail tells: one session must not read "2h ago"
  // in one surface and "12 Jun" in the other.
  const nowMs = useCoarseNow()

  return (
    <CommandItem
      keywords={sessionPaletteKeywords(session)}
      value={sessionItemValue(session.id)}
      onSelect={() => selectSession(session)}
    >
      <span
        aria-label={threadStatusLabel(session.status)}
        className={cn('size-1.5 shrink-0 rounded-full', threadStatusDotClass(session.status))}
      />
      <span className='max-w-[55%] shrink-0 truncate font-medium'>{session.title}</span>
      <span className='text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 truncate text-[11px]'>
        <span className='truncate'>{session.projectTitle}</span>
        {session.branch ? <GitBranchIcon className='size-3 shrink-0' /> : null}
        {session.branch ? <span className='truncate'>{session.branch}</span> : null}
      </span>
      <CommandShortcut className='tabular-nums'>
        {formatChatRelativeTime(session.activityAt, nowMs)}
      </CommandShortcut>
    </CommandItem>
  )
}
