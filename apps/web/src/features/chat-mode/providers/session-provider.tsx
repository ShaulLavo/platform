import { useEffect, useMemo, type ReactNode } from 'react'

import { createLocalChatEnvironment } from '@/features/chat/environment/local-chat-environment'
import { useChatShellSubscription } from '@/features/chat/hooks/use-chat-shell-subscription'
import { useWorkspaceChatProject } from '@/features/chat/hooks/use-workspace-chat-project'
import { selectChatSidebarThreadsForProject } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { SessionDeleteDialog } from '@/features/chat-mode/components/session-delete-dialog'
import { useProjectRetry } from '@/features/chat-mode/hooks/use-project-retry'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { setSessionProjectOpener } from '@/features/chat-mode/state/session-commands'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { activeSession } from '@/features/chat-mode/utils/active-session'
import { compareSessionsByCreation } from '@/features/chat-mode/utils/session-order'
import { useOpenWorkspaceRoot } from '@/hooks/use-open-workspace-root'
import { useActiveProjectStore } from '@/state/active-project-store'

const NO_PROJECT_THREAD_IDS: readonly never[] = []

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
  const projectThreadIds = useChatProjectionStore((state) =>
    projectId
      ? (state.threadIdsByProjectId[projectId] ?? NO_PROJECT_THREAD_IDS)
      : NO_PROJECT_THREAD_IDS,
  )
  const summaryById = useChatProjectionStore((state) => state.sidebarThreadSummaryById)
  const threads = projectThreads.toSorted(compareSessionsByCreation)
  const threadIds = threads.map((thread) => thread.id)
  const archivedThreadIds = projectThreadIds.filter((threadId) =>
    Boolean(summaryById[threadId]?.archivedAt),
  )
  const restored = useSessionSelectionStore((state) => state.restored)
  const selection = useSessionSelectionStore((state) => state.selection)
  const selectSession = useSessionSelectionStore((state) => state.selectSession)
  const startDraft = useSessionSelectionStore((state) => state.startDraft)
  const openWorkspaceRoot = useOpenWorkspaceRoot()
  const retry = useProjectRetry({ environment, rootPath })
  // Reuses the workspace picker already mounted by AppWorkspace: picking a folder
  // opens it, and useWorkspaceChatProject creates the project for it.
  const addProject = useEditorWorkspaceState((state) => state.openPicker)

  // Keyboard session commands run from the app keymap, far above this tree, so the
  // one app-level thing they need is handed down to them for as long as chat mode is up.
  useEffect(() => {
    setSessionProjectOpener(openWorkspaceRoot)

    return () => setSessionProjectOpener(null)
  }, [openWorkspaceRoot])

  const value: ChatModeSession = {
    activeSession: activeSession({
      archivedThreadIds,
      projectId,
      restored,
      selection,
      threadIds,
    }),
    addProject,
    environment,
    error: chatModeError({
      hasProject: projectState.project !== null,
      projectError: projectState.error,
      retryError: retry.error,
      shellError: shell.error,
    }),
    openProject: (workspaceRoot) => void openWorkspaceRoot(workspaceRoot),
    project: projectState.project,
    ready: projectState.status === 'ready',
    retrying: retry.retrying,
    retryProject: retry.retryProject,
    // The project's own root, never the editor's: a draft dispatched here stamps this
    // path into the event log as the thread's worktree, and that stamp is permanent.
    rootPath: projectState.project?.workspaceRoot ?? rootPath,
    selectSession,
    startDraft,
    threads,
  }

  return (
    <ChatModeSessionContext value={value}>
      {children}
      {/* Mounted here, not in the rail: the row that asks for the delete is the first
          thing to unmount once the answer is yes. */}
      <SessionDeleteDialog />
    </ChatModeSessionContext>
  )
}

/**
 * A project that exists is the proof the setup failure is over, so its error stops being
 * reported — otherwise a successful retry leaves the banner from the attempt before it
 * sitting under a working chat.
 */
function chatModeError({
  hasProject,
  projectError,
  retryError,
  shellError,
}: {
  readonly hasProject: boolean
  readonly projectError: string | null
  readonly retryError: string | null
  readonly shellError: string | null
}) {
  if (hasProject) return shellError

  return retryError ?? projectError ?? shellError
}
