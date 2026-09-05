import { useActiveChatProjection } from '@/features/chat/hooks/use-active-projection'
import { memo, useCallback, useMemo } from 'react'

import { useActiveChatSessionId } from '../hooks/use-active-chat-session-id'
import { useChatShellSubscription } from '../hooks/use-chat-shell-subscription'
import { useWorkspaceChatProject } from '../hooks/use-workspace-chat-project'
import { compareChatSidebarSessions } from '@/features/chat/utils/formatters'
import { useChatTransport } from '@/features/chat/hooks/use-chat-transport'
import { selectChatSidebarSessionsForProject } from '../state/chat-projection-selectors'
import { ChatPanelHeader } from './chat-panel-header'
import { ChatPanelStatus } from './chat-panel-status'
import { ChatDraftView } from './chat-draft-view'
import { ChatView } from './chat-view'

export const ChatSidePanelContent = memo(({ rootPath }: { rootPath: string }) => {
  const transport = useChatTransport()
  const shell = useChatShellSubscription(transport)
  const projectState = useWorkspaceChatProject({ transport, rootPath })
  const projectId = projectState.project?.id
  const sidebarSessions = useActiveChatProjection((state) =>
    selectChatSidebarSessionsForProject(state, projectId),
  )
  const sessions = useMemo(
    () => sidebarSessions.toSorted(compareChatSidebarSessions),
    [sidebarSessions],
  )
  const sessionIds = useMemo(() => sessions.map((session) => session.id), [sessions])
  const { activeSessionId, selectDraftSession, setActiveSessionId } =
    useActiveChatSessionId(sessionIds)
  const disabled = !projectState.project || projectState.status !== 'ready'

  const handleNewChat = useCallback(() => {
    selectDraftSession()
  }, [selectDraftSession])

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <ChatPanelHeader
        activeSessionId={activeSessionId}
        creating={false}
        disabled={disabled}
        sessions={sessions}
        onNewChat={handleNewChat}
        onSelectSession={setActiveSessionId}
      />
      {activeSessionId ? (
        <ChatView
          key={activeSessionId}
          activeSessionId={activeSessionId}
          transport={transport}
          rootPath={rootPath}
          onSessionCreated={setActiveSessionId}
        />
      ) : (
        <ChatDraftView
          disabled={disabled}
          transport={transport}
          project={projectState.project}
          worktreeId={projectState.worktree?.id ?? null}
          rootPath={rootPath}
          onSessionCreated={setActiveSessionId}
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
