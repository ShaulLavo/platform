import type { OrchestrationMessage } from '@workspace/contracts'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { cn } from '@workspace/ui/lib/utils'

import { formatChatTimestamp } from '../lib/chat-formatters'
import type { OptimisticChatMessage } from '../state/chat-optimistic-store'

export function MessageBubble({
  message,
}: {
  message: OrchestrationMessage | OptimisticChatMessage
}) {
  const user = message.role === 'user'
  const optimistic = 'optimistic' in message

  return (
    <Message
      className={cn('max-w-full px-0', optimistic && 'opacity-70')}
      from={user ? 'user' : 'assistant'}
    >
      <MessageContent
        className={cn(
          'max-w-[88%] rounded-md border px-3 py-2 text-sm leading-5',
          user
            ? 'border-primary/15 bg-primary text-primary-foreground group-[.is-user]:rounded-md group-[.is-user]:bg-primary group-[.is-user]:px-3 group-[.is-user]:py-2 group-[.is-user]:text-primary-foreground'
            : 'border-border bg-muted/35 text-foreground',
        )}
      >
        {user ? (
          <div className='break-words whitespace-pre-wrap'>{message.text}</div>
        ) : (
          <MessageResponse>{message.text}</MessageResponse>
        )}
        <div
          className={cn(
            'mt-1 text-[10px] tabular-nums',
            user ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {optimistic ? 'Sending' : formatChatTimestamp(message.updatedAt)}
        </div>
      </MessageContent>
    </Message>
  )
}
