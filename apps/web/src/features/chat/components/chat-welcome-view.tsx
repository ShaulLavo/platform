import type { ThreadId } from '@workspace/contracts'

import type { ChatSidebarThreadSummary } from '../state/chat-projection-store'
import { PastConversations } from './past-conversations'

export function ChatWelcomeView({
  activeThreadId,
  onSelectThread,
  pastThreads,
}: {
  activeThreadId: ThreadId | null
  onSelectThread: (threadId: ThreadId) => void
  pastThreads: readonly ChatSidebarThreadSummary[]
}) {
  return (
    <div className='flex min-h-0 flex-1 flex-col justify-end overflow-y-auto'>
      <div className='min-h-[18rem] flex-1' />
      <PastConversations
        activeThreadId={activeThreadId}
        threads={pastThreads}
        onSelectThread={onSelectThread}
      />
    </div>
  )
}
