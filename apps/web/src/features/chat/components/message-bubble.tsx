import type { OrchestrationMessage } from '@workspace/contracts'
import { cn } from '@workspace/ui/lib/utils'

import { formatChatTimestamp } from '../lib/chat-formatters'
import type { OptimisticChatMessage } from '../state/chat-optimistic-store'
import { AssistantMarkdown } from './assistant-markdown'

export function MessageBubble({
  message,
}: {
  message: OrchestrationMessage | OptimisticChatMessage
}) {
  const user = message.role === 'user'
  const optimistic = 'optimistic' in message
  const attachments = message.attachments ?? []
  const emptyAssistantCompletion = !user && !message.streaming && message.text.trim().length === 0

  return (
    <div
      className={cn(
        'flex w-full min-w-0',
        user ? 'justify-end' : 'justify-start',
        optimistic && 'opacity-70',
      )}
    >
      <article
        className={cn(
          'min-w-0 text-sm leading-5',
          user
            ? 'max-w-[80%] rounded-2xl rounded-br-sm border border-border bg-secondary px-4 py-3 text-secondary-foreground'
            : 'w-full max-w-full px-1 py-0.5 text-foreground',
        )}
      >
        {user ? (
          <div className='break-words whitespace-pre-wrap'>{message.text}</div>
        ) : emptyAssistantCompletion ? (
          <div className='text-muted-foreground text-xs italic'>
            Assistant completed without text.
          </div>
        ) : (
          <AssistantMarkdown text={message.text} streaming={message.streaming} />
        )}
        {attachments.length > 0 ? (
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {attachments.map((attachment) => (
              <span
                className={cn(
                  'rounded border px-1.5 py-0.5 text-[10px]',
                  user
                    ? 'border-border/70 text-muted-foreground'
                    : 'border-border text-muted-foreground',
                )}
                key={attachment.id}
              >
                {attachment.name}
              </span>
            ))}
          </div>
        ) : null}
        <div
          className={cn(
            'mt-1 text-[10px] tabular-nums',
            user ? 'text-muted-foreground/50' : 'text-muted-foreground/30',
          )}
        >
          {messageTimestampLabel(message, optimistic)}
        </div>
      </article>
    </div>
  )
}

function messageTimestampLabel(
  message: OrchestrationMessage | OptimisticChatMessage,
  optimistic: boolean,
) {
  if (optimistic) return 'Sending'
  if (message.streaming) return 'Streaming'

  return formatChatTimestamp(message.updatedAt)
}
