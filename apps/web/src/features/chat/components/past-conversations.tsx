import type { ThreadId } from '@workspace/contracts'

import type { ChatSidebarThreadSummary } from '../state/chat-projection-store'
import { PastConversationRow } from './past-conversation-row'

export function PastConversations({
  activeThreadId,
  onSelectThread,
  threads,
}: {
  activeThreadId: ThreadId | null
  onSelectThread: (threadId: ThreadId) => void
  threads: readonly ChatSidebarThreadSummary[]
}) {
  if (threads.length === 0) return null

  return (
    <section className='mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-3'>
      <h3 className='text-muted-foreground text-sm font-semibold tracking-normal'>
        Past Conversations
      </h3>
      <div className='space-y-2'>
        {threads.map((thread) => (
          <PastConversationRow
            active={thread.id === activeThreadId}
            key={thread.id}
            thread={thread}
            onSelect={onSelectThread}
          />
        ))}
      </div>
    </section>
  )
}
