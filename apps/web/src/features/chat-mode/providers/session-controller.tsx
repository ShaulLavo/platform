import { useEffect, type ReactNode } from 'react'

import { useChatTransport } from '@/features/chat/hooks/use-chat-transport'
import { useChatShellSubscription } from '@/features/chat/hooks/use-chat-shell-subscription'
import { useWorkspaceChatProject } from '@/features/chat/hooks/use-workspace-chat-project'
import { selectChatSessionThreadsForProject } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useEditorWorkspaceState } from '@/features/editor/state/workspace-state'
import { ProjectDeleteDialog } from '@/features/chat-mode/components/project-delete-dialog'
import { ProjectRenameDialog } from '@/features/chat-mode/components/project-rename-dialog'
import { SessionDeleteDialog } from '@/features/chat-mode/components/session-delete-dialog'
import { useProjectRetry } from '@/features/chat-mode/hooks/use-project-retry'
import { ChatRailOrderProvider } from '@/features/chat-mode/providers/rail-order-provider'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { setSessionProjectOpener } from '@/features/chat-mode/state/session-commands'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { activeSession } from '@/features/chat-mode/utils/active-session'
import { compareSessionsForRail } from '@/features/chat-mode/utils/session-order'
import { useOpenWorkspaceRoot } from '@/features/workspace/hooks/use-open-root'
import { useActiveProjectStore } from '@/features/workspace/state/active-project'

export function ChatModeSessionController({
  children,
  editorRootPath,
}: {
  readonly children: ReactNode
  /** Where the editor currently is. Chat follows it only until a project is activated. */
  readonly editorRootPath: string
}) {
  const transport = useChatTransport()
  const shell = useChatShellSubscription(transport)
  const activeWorkspaceRoot = useActiveProjectStore((state) => state.workspaceRoot)
  const rootPath = activeWorkspaceRoot ?? editorRootPath
  const projectState = useWorkspaceChatProject({ transport, rootPath })
  const projectId = projectState.project?.id ?? null
  const projectThreads = useChatProjectionStore((state) =>
    selectChatSessionThreadsForProject(state, projectId),
  )
  const threads = projectThreads
    .filter((thread) => !thread.archivedAt)
    .toSorted(compareSessionsForRail)
  const threadIds = threads.map((thread) => thread.id)
  const archivedThreadIds = projectThreads
    .filter((thread) => Boolean(thread.archivedAt))
    .map((thread) => thread.id)
  const restored = useSessionSelectionStore((state) => state.restored)
  const selection = useSessionSelectionStore((state) => state.selection)
  const selectSession = useSessionSelectionStore((state) => state.selectSession)
  const startDraft = useSessionSelectionStore((state) => state.startDraft)
  const openWorkspaceRoot = useOpenWorkspaceRoot()
  const retry = useProjectRetry({ transport, rootPath })
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
    transport,
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
  }

  return (
    <ChatModeSessionContext value={value}>
      {/* Inside the session context, which is where the dispatching transport
          lives, and above the rail, which is the only surface that reorders. */}
      <ChatRailOrderProvider>{children}</ChatRailOrderProvider>
      {/* Mounted here, not in the rail: the row that asks for the delete is the first
          thing to unmount once the answer is yes. */}
      <SessionDeleteDialog />
      <ProjectDeleteDialog />
      <ProjectRenameDialog />
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
