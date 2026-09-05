import type { ProjectId } from '@workspace/contracts'

import { createProjectDeleteCommand } from '@/features/chat/utils/command-builders'
import { dispatchChatCommand } from '@/features/chat/utils/command-dispatch'
import { selectChatSidebarThreadsForProject } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useSessionActions } from '@/features/chat-mode/hooks/use-session-actions'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'
import {
  useProjectDeleteRequestStore,
  type ProjectDeleteRequest,
} from '@/features/chat-mode/state/project-delete-request-store'
import { clearSessionMultiSelect } from '@/features/chat-mode/state/session-commands'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import type { SessionRailProject } from '@/features/chat-mode/utils/session-rail-model'

/**
 * The only place chat mode mutates a project's whole band. Deleting drops every
 * thread the project owns along with it, so it always routes through the
 * confirmation dialog; archiving delegates to the per-session action, which is
 * what lets a running session refuse on its own terms.
 */
export function useProjectActions() {
  const { transport } = useChatModeSession()
  const sessionActions = useSessionActions()
  const releaseSession = useSessionSelectionStore((state) => state.releaseSession)
  const requestDelete = useProjectDeleteRequestStore((state) => state.requestDelete)
  const dismissDelete = useProjectDeleteRequestStore((state) => state.dismissDelete)

  return {
    /** Every session still in the inbox; running ones refuse themselves with a toast. */
    archiveAllSessions(projectId: ProjectId) {
      const threads = selectChatSidebarThreadsForProject(
        useChatProjectionStore.getState(),
        projectId,
      )
      sessionActions.archiveSessions(threads.map((thread) => thread.id))
    },
    cancelDelete() {
      dismissDelete()
    },
    /** Runs the delete the dialog just confirmed — nothing else may call it. */
    confirmDelete(request: ProjectDeleteRequest) {
      dismissDelete()
      // The stage must let go before the cascade lands: an empty neighbour list
      // sends it to auto, since every sibling row is going away with the project.
      for (const threadId of projectThreadIds(request.projectId)) {
        releaseSession(threadId, [])
      }
      clearSessionMultiSelect()
      void dispatchChatCommand({
        action: 'chat.project.delete',
        command: createProjectDeleteCommand({ projectId: request.projectId }),
        dispatchCommand: transport.dispatchCommand,
      })
    },
    /** Deleting cascades onto every session in the project, so it always asks first. */
    deleteProject(project: SessionRailProject) {
      requestDelete({
        projectId: project.id,
        sessionCount: projectThreadIds(project.id).length,
        title: project.title,
      })
    },
  }
}

/** Every live thread, archived included — the cascade does not spare the archive. */
function projectThreadIds(projectId: ProjectId) {
  return useChatProjectionStore.getState().threadIdsByProjectId[projectId] ?? []
}
