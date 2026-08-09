import { useEffect, useMemo, type ReactNode } from 'react'

import { createLocalChatEnvironment } from '@/features/chat/environment/local-chat-environment'
import { useChatShellSubscription } from '@/features/chat/hooks/use-chat-shell-subscription'
import { useWorkspaceChatProject } from '@/features/chat/hooks/use-workspace-chat-project'
import { compareChatSidebarThreads } from '@/features/chat/lib/chat-formatters'
import { selectChatSidebarThreadsForProject } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { prewarmSidebarThreadDetails } from '@/features/chat/state/thread-detail-subscriptions'
import { useOpenProject } from '@/features/chat-mode/hooks/use-open-project'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { activeSession } from '@/features/chat-mode/utils/active-session'

export function ChatModeSessionProvider({
  children,
  rootPath,
}: {
  readonly children: ReactNode
  readonly rootPath: string
}) {
  // One environment per surface: a new instance would restart the shell subscription.
  const environment = useMemo(() => createLocalChatEnvironment(), [])
  const shell = useChatShellSubscription(environment)
  const projectState = useWorkspaceChatProject({ environment, rootPath })
  const projectId = projectState.project?.id ?? null
  const projectThreads = useChatProjectionStore((state) =>
    selectChatSidebarThreadsForProject(state, projectId),
  )
  const threads = projectThreads.toSorted(compareChatSidebarThreads)
  const threadIds = threads.map((thread) => thread.id)
  const selection = useSessionSelectionStore((state) => state.selection)
  const selectSession = useSessionSelectionStore((state) => state.selectSession)
  const startDraft = useSessionSelectionStore((state) => state.startDraft)
  const pendingWorkspaceRoot = useSessionSelectionStore((state) => state.pendingWorkspaceRoot)
  const settleProjectSwitch = useSessionSelectionStore((state) => state.settleProjectSwitch)
  const openProject = useOpenProject()
  // Reuses the workspace picker already mounted by AppWorkspace: picking a folder
  // swaps the root, and useWorkspaceChatProject creates the project for it.
  const addProject = useEditorWorkspaceState((state) => state.openPicker)
  const value: ChatModeSession = {
    activeSession: activeSession({
      projectId,
      selection,
      switchingProject: pendingWorkspaceRoot !== null,
      threadIds,
    }),
    addProject,
    environment,
    error: projectState.error ?? shell.error,
    openProject,
    project: projectState.project,
    ready: projectState.status === 'ready',
    selectSession,
    startDraft,
    threads,
  }

  useEffect(() => {
    prewarmSidebarThreadDetails(threadIds)
  }, [threadIds])

  useEffect(() => {
    if (pendingWorkspaceRoot !== rootPath) return

    settleProjectSwitch()
  }, [pendingWorkspaceRoot, rootPath, settleProjectSwitch])

  return <ChatModeSessionContext value={value}>{children}</ChatModeSessionContext>
}
