import { useEffect, useMemo, type ReactNode } from 'react'

import { createLocalChatEnvironment } from '@/features/chat/environment/local-chat-environment'
import { useChatShellSubscription } from '@/features/chat/hooks/use-chat-shell-subscription'
import { useWorkspaceChatProject } from '@/features/chat/hooks/use-workspace-chat-project'
import { compareChatSidebarThreads } from '@/features/chat/lib/chat-formatters'
import { selectChatSidebarThreadsForProject } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { prewarmSidebarThreadDetails } from '@/features/chat/state/thread-detail-subscriptions'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { activeSession } from '@/features/chat-mode/utils/active-session'
import { useOpenWorkspaceRoot } from '@/hooks/use-open-workspace-root'
import { useActiveProjectStore } from '@/state/active-project-store'

export function ChatModeSessionProvider({
  children,
  editorRootPath,
}: {
  readonly children: ReactNode
  /** Where the editor currently is. Chat follows it only until a project is activated. */
  readonly editorRootPath: string
}) {
  // One environment per surface: a new instance would restart the shell subscription.
  const environment = useMemo(() => createLocalChatEnvironment(), [])
  const shell = useChatShellSubscription(environment)
  const activeWorkspaceRoot = useActiveProjectStore((state) => state.workspaceRoot)
  const rootPath = activeWorkspaceRoot ?? editorRootPath
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
  const openWorkspaceRoot = useOpenWorkspaceRoot()
  // Reuses the workspace picker already mounted by AppWorkspace: picking a folder
  // opens it, and useWorkspaceChatProject creates the project for it.
  const addProject = useEditorWorkspaceState((state) => state.openPicker)
  const value: ChatModeSession = {
    activeSession: activeSession({ projectId, selection, threadIds }),
    addProject,
    environment,
    error: projectState.error ?? shell.error,
    openProject: (workspaceRoot) => void openWorkspaceRoot(workspaceRoot),
    project: projectState.project,
    ready: projectState.status === 'ready',
    // The project's own root, never the editor's: a draft dispatched here stamps this
    // path into the event log as the thread's worktree, and that stamp is permanent.
    rootPath: projectState.project?.workspaceRoot ?? rootPath,
    selectSession,
    startDraft,
    threads,
  }

  useEffect(() => {
    prewarmSidebarThreadDetails(threadIds)
  }, [threadIds])

  return <ChatModeSessionContext value={value}>{children}</ChatModeSessionContext>
}
