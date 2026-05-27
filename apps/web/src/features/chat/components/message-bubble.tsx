import type { OrchestrationMessage } from '@workspace/contracts'
import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { cn } from '@workspace/ui/lib/utils'
import { Streamdown } from 'streamdown'

import { formatChatTimestamp } from '../lib/chat-formatters'
import type { OptimisticChatMessage } from '../state/chat-optimistic-store'

const streamdownPlugins = { cjk, code, math, mermaid }

export function MessageBubble({
  message,
}: {
  message: OrchestrationMessage | OptimisticChatMessage
}) {
  const user = message.role === 'user'
  const optimistic = 'optimistic' in message

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
          'min-w-0 max-w-[88%] rounded-md border px-3 py-2 text-sm leading-5 shadow-sm',
          user
            ? 'border-blue-500/30 bg-blue-600 text-white'
            : 'border-border/70 bg-background/75 text-foreground',
        )}
      >
        {user ? (
          <div className='break-words whitespace-pre-wrap'>{message.text}</div>
        ) : (
          <Streamdown
            className='min-w-0 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0'
            plugins={streamdownPlugins}
          >
            {message.text}
          </Streamdown>
        )}
        <div
          className={cn(
            'mt-1 text-[10px] tabular-nums',
            user ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          {optimistic ? 'Sending' : formatChatTimestamp(message.updatedAt)}
        </div>
      </article>
    </div>
  )
}
