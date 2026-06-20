import { memo, useCallback, useEffect, useMemo } from 'react'

import { useActiveChatThreadId } from '../hooks/use-active-chat-thread-id'
import { useChatShellSubscription } from '../hooks/use-chat-shell-subscription'
import { useWorkspaceChatProject } from '../hooks/use-workspace-chat-project'
import { compareChatSidebarThreads } from '../lib/chat-formatters'
import { createLocalChatEnvironment } from '../environment/local-chat-environment'
import { prewarmSidebarThreadDetails } from '../state/thread-detail-subscriptions'
import { selectChatSidebarThreadsForProject } from '../state/chat-projection-selectors'
import { useChatProjectionStore } from '../state/chat-projection-store'
import { ChatPanelHeader } from './chat-panel-header'
import { ChatPanelStatus } from './chat-panel-status'
import { ChatDraftView } from './chat-draft-view'
import { ChatView } from './chat-view'

export const ChatSidePanel = memo(({ rootPath }: { rootPath: string }) => {
  const environment = useMemo(() => createLocalChatEnvironment(), [])
  const shell = useChatShellSubscription(environment)
  const projectState = useWorkspaceChatProject({ environment, rootPath })
  const projectId = projectState.project?.id
  const sidebarThreads = useChatProjectionStore((state) =>
    selectChatSidebarThreadsForProject(state, projectId),
  )
  const threads = useMemo(
    () => sidebarThreads.toSorted(compareChatSidebarThreads),
    [sidebarThreads],
  )
  const threadIds = useMemo(() => threads.map((thread) => thread.id), [threads])
  const { activeThreadId, selectDraftThread, setActiveThreadId } = useActiveChatThreadId(threadIds)
  const disabled = !projectState.project || projectState.status !== 'ready'

  useEffect(() => {
    prewarmSidebarThreadDetails(threadIds)
  }, [threadIds])

  const handleNewChat = useCallback(() => {
    selectDraftThread()
  }, [selectDraftThread])

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <ChatPanelHeader
        activeThreadId={activeThreadId}
        creating={false}
        disabled={disabled}
        threads={threads}
        onNewChat={handleNewChat}
        onSelectThread={setActiveThreadId}
      />
      {activeThreadId ? (
        <ChatView
          key={activeThreadId}
          activeThreadId={activeThreadId}
          environment={environment}
          rootPath={rootPath}
        />
      ) : (
        <ChatDraftView
          disabled={disabled}
          environment={environment}
          project={projectState.project}
          rootPath={rootPath}
          onThreadCreated={setActiveThreadId}
        />
      )}
      <ChatPanelStatus
        createError={null}
        projectError={projectState.error}
        shellError={shell.error}
      />
    </div>
  )
})
