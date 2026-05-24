import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useActiveChatThreadId } from '../hooks/use-active-chat-thread-id'
import { useChatShellSubscription } from '../hooks/use-chat-shell-subscription'
import { useWorkspaceChatProject } from '../hooks/use-workspace-chat-project'
import { createThreadCommand } from '../lib/chat-command-builders'
import { compareChatSidebarThreads } from '../lib/chat-formatters'
import { createLocalChatEnvironment } from '../environment/local-chat-environment'
import { prewarmSidebarThreadDetails } from '../state/thread-detail-subscriptions'
import { selectChatSidebarThreadsForProject } from '../state/chat-projection-selectors'
import { useChatProjectionStore } from '../state/chat-projection-store'
import { ChatPanelHeader } from './chat-panel-header'
import { ChatPanelStatus } from './chat-panel-status'
import { ChatView } from './chat-view'

export function ChatSidePanel({ rootPath }: { rootPath: string }) {
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
  const { activeThreadId, setActiveThreadId } = useActiveChatThreadId(threadIds)
  const pastThreads = useMemo(
    () => threads.filter((thread) => thread.id !== activeThreadId),
    [activeThreadId, threads],
  )
  const autoCreateProjectIds = useRef(new Set<string>())
  const [creatingThread, setCreatingThread] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const disabled = !projectState.project || projectState.status !== 'ready'

  useEffect(() => {
    prewarmSidebarThreadDetails(threadIds)
  }, [threadIds])

  const createWorkspaceThread = useCallback(async () => {
    if (!projectState.project) return

    setCreatingThread(true)
    setCreateError(null)
    try {
      const command = createThreadCommand({
        createdAt: new Date().toISOString(),
        projectId: projectState.project.id,
        rootPath,
      })
      setActiveThreadId(command.threadId)
      await environment.dispatchCommand(command)
    } catch (error) {
      setActiveThreadId(threadIds[0] ?? null)
      setCreateError(chatPanelErrorMessage(error))
    } finally {
      setCreatingThread(false)
    }
  }, [environment, projectState.project, rootPath, setActiveThreadId, threadIds])

  useEffect(() => {
    if (disabled) return
    if (!projectState.project) return
    if (threadIds.length > 0) return
    if (creatingThread) return
    if (autoCreateProjectIds.current.has(projectState.project.id)) return

    autoCreateProjectIds.current.add(projectState.project.id)
    void createWorkspaceThread()
  }, [createWorkspaceThread, creatingThread, disabled, projectState.project, threadIds.length])

  return (
    <div className='bg-background flex h-full min-h-0 flex-col'>
      <ChatPanelHeader
        activeThreadId={activeThreadId}
        creating={creatingThread}
        disabled={disabled}
        threads={threads}
        onNewChat={createWorkspaceThread}
        onSelectThread={setActiveThreadId}
      />
      <ChatView
        activeThreadId={activeThreadId}
        environment={environment}
        pastThreads={pastThreads}
        rootPath={rootPath}
        onSelectThread={setActiveThreadId}
      />
      <ChatPanelStatus
        createError={createError}
        projectError={projectState.error}
        shellError={shell.error}
      />
    </div>
  )
}

function chatPanelErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return 'Could not create a chat thread.'
}
