import type { ThreadId } from '@workspace/contracts'
import { cn } from '@workspace/ui/lib/utils'
import { ChatTeardropTextIcon } from '@phosphor-icons/react'

import { formatChatDateLabel } from '../lib/chat-formatters'
import type { ChatSidebarThreadSummary } from '../state/chat-projection-store'

export function PastConversationRow({
  active,
  onSelect,
  thread,
}: {
  active: boolean
  onSelect: (threadId: ThreadId) => void
  thread: ChatSidebarThreadSummary
}) {
  return (
    <button
      className={cn(
        'group flex h-12 w-full items-center gap-3 rounded-md border border-transparent bg-muted/45 px-3 text-left transition-[background-color,border-color,transform] duration-150 hover:bg-muted active:scale-[0.995] focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none',
        active && 'border-border bg-muted',
      )}
      type='button'
      onClick={() => onSelect(thread.id)}
    >
      <ChatTeardropTextIcon className='text-muted-foreground size-4 shrink-0' />
      <span className='min-w-0 flex-1 truncate text-sm font-medium'>{thread.title}</span>
      <span className='text-muted-foreground shrink-0 text-xs'>
        {formatChatDateLabel(thread.updatedAt)}
      </span>
    </button>
  )
}
