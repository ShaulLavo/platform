import type { ThreadId } from '@workspace/contracts'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { ChatCircleIcon, ClockCounterClockwiseIcon, PlusIcon } from '@phosphor-icons/react'

import { chatThreadPreview, formatChatDateLabel } from '../lib/chat-formatters'
import type { ChatSidebarThreadSummary } from '../state/chat-projection-store'

export function ChatPanelHeader({
  activeThreadId,
  creating,
  disabled,
  onNewChat,
  onSelectThread,
  threads,
}: {
  activeThreadId: ThreadId | null
  creating: boolean
  disabled: boolean
  onNewChat: () => void
  onSelectThread: (threadId: ThreadId) => void
  threads: readonly ChatSidebarThreadSummary[]
}) {
  const historyDisabled = threads.length === 0
  const activeThread = threads.find((thread) => thread.id === activeThreadId)

  return (
    <header className='border-border/70 bg-background backdrop-material flex h-12 shrink-0 items-center justify-between border-b px-3'>
      <div className='min-w-0 pr-3'>
        <div className='truncate text-sm font-semibold'>Chat</div>
        {activeThread ? (
          <div className='text-muted-foreground truncate text-[11px]'>{activeThread.title}</div>
        ) : null}
      </div>
      <div className='flex items-center gap-1'>
        <Button
          aria-label='New chat'
          className='rounded-md'
          disabled={disabled || creating}
          size='icon-sm'
          title='New chat'
          type='button'
          variant='ghost'
          onClick={onNewChat}
        >
          <span className='relative flex size-4 items-center justify-center'>
            <ChatCircleIcon className='size-4' />
            <PlusIcon
              className='bg-background absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full'
              weight='bold'
            />
          </span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label='Conversation history'
                className='rounded-md'
                disabled={historyDisabled}
                size='icon-sm'
                title='Conversation history'
                type='button'
                variant='ghost'
              />
            }
          >
            <ClockCounterClockwiseIcon className='size-4' />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-72 rounded-md p-1'>
            {threads.map((thread) => (
              <DropdownMenuItem
                className={cn(
                  'grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-md px-2.5 py-2.5',
                  thread.id === activeThreadId && 'bg-muted/70',
                )}
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
              >
                <span className='truncate font-medium'>
                  {thread.id === activeThreadId ? 'Current: ' : ''}
                  {thread.title}
                </span>
                <span className='text-muted-foreground text-[11px] tabular-nums'>
                  {formatChatDateLabel(thread.updatedAt)}
                </span>
                <span className='text-muted-foreground col-span-2 truncate text-[11px] tabular-nums'>
                  {chatThreadPreview(thread)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
