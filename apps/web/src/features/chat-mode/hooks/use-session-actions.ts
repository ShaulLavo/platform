import type { ClientOrchestrationCommand, ThreadId } from '@workspace/contracts'
import { toast } from 'sonner'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import {
  createThreadArchiveCommand,
  createThreadDeleteCommand,
  createThreadRenameCommand,
  createThreadSessionStopCommand,
  createThreadUnarchiveCommand,
} from '@/features/chat/lib/chat-command-builders'
import { selectChatSidebarThreadsForProject } from '@/features/chat/state/chat-projection-selectors'
import {
  useChatProjectionStore,
  type ChatSidebarThreadSummary,
} from '@/features/chat/state/chat-projection-store'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'
import { clearSessionMultiSelect } from '@/features/chat-mode/state/session-commands'
import {
  useSessionDeleteRequestStore,
  type SessionDeleteRequest,
} from '@/features/chat-mode/state/session-delete-request-store'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { compareSessionsForRail } from '@/features/chat-mode/utils/session-order'
import { hasRunningTurn } from '@/features/chat-mode/utils/running-turn'
import { log } from '@/lib/client-logging'
import { errorMessage } from '@/lib/error-message'

/**
 * The only place chat mode mutates a thread. Every action is fire-and-forget:
 * the server's event lands on the shell stream and the projection redraws the
 * rail, so nothing here waits on the response to update the UI.
 */
export function useSessionActions() {
  const { environment } = useChatModeSession()
  const releaseSession = useSessionSelectionStore((state) => state.releaseSession)
  const requestDelete = useSessionDeleteRequestStore((state) => state.requestDelete)
  const dismissDelete = useSessionDeleteRequestStore((state) => state.dismissDelete)

  function dispatch(action: string, threadId: ThreadId, command: ClientOrchestrationCommand) {
    void dispatchSessionCommand({ action, command, environment, threadId })
  }

  function archive(threadId: ThreadId) {
    const thread = threadSummary(threadId)
    // Archiving only hides the row; the agent would keep writing to a thread the user
    // can no longer reach. Stopping it is a deliberate act, so ask for it instead.
    if (hasRunningTurn(thread)) {
      toast.error(`“${thread?.title ?? 'This session'}” is still running`, {
        description: 'Stop the agent session before archiving it.',
      })
      log.warn({
        action: 'chat.session.archive',
        area: 'chat',
        commandType: 'thread.archive',
        outcome: 'blocked',
        reason: 'turn-running',
        sessionStatus: thread?.session?.status ?? null,
        threadId,
        turnState: thread?.latestTurn?.state ?? null,
      })

      return
    }

    // The rail hides archived sessions, so the stage must let go of this one
    // before it vanishes from the list.
    releaseSession(threadId, railOrderThreadIds(thread))
    dispatch('chat.session.archive', threadId, createThreadArchiveCommand({ threadId }))
  }

  return {
    archive,
    /** One command per session, each refusing on its own terms — a running one blocks itself. */
    archiveSessions(threadIds: readonly ThreadId[]) {
      for (const threadId of threadIds) {
        archive(threadId)
      }
      clearSessionMultiSelect()
    },
    cancelDelete() {
      dismissDelete()
    },
    /** Runs the delete the dialog just confirmed — nothing else may call it. */
    confirmDelete(request: SessionDeleteRequest) {
      dismissDelete()
      for (const threadId of request.threadIds) {
        releaseSession(threadId, railOrderThreadIds(threadSummary(threadId)))
        dispatch('chat.session.delete', threadId, createThreadDeleteCommand({ threadId }))
      }
      clearSessionMultiSelect()
    },
    /** Deleting drops the whole event history for the thread, so it always asks first. */
    deleteSession(threadId: ThreadId, title: string) {
      requestDelete({ threadIds: [threadId], title })
    },
    deleteSessions(threadIds: readonly ThreadId[]) {
      const first = threadIds[0]
      if (!first) return

      requestDelete({ threadIds, title: threadSummary(first)?.title ?? 'this session' })
    },
    /** `title` must already be trimmed and non-empty — the server rejects blanks. */
    rename(threadId: ThreadId, title: string) {
      dispatch('chat.session.rename', threadId, createThreadRenameCommand({ threadId, title }))
    },
    stopAgent(threadId: ThreadId) {
      dispatch('chat.session.stopAgent', threadId, createThreadSessionStopCommand({ threadId }))
    },
    unarchive(threadId: ThreadId) {
      dispatch('chat.session.unarchive', threadId, createThreadUnarchiveCommand({ threadId }))
    },
  }
}

/**
 * Read at call time rather than subscribed: the rail lists every project, so the session
 * being acted on is not always one the surrounding surface is showing.
 */
function threadSummary(threadId: ThreadId) {
  return useChatProjectionStore.getState().sidebarThreadSummaryById[threadId]
}

/** The departing session's own project, in the order the rail draws it. */
function railOrderThreadIds(thread: ChatSidebarThreadSummary | undefined) {
  if (!thread) return []

  return selectChatSidebarThreadsForProject(useChatProjectionStore.getState(), thread.projectId)
    .toSorted(compareSessionsForRail)
    .map((entry) => entry.id)
}

async function dispatchSessionCommand({
  action,
  command,
  environment,
  threadId,
}: {
  action: string
  command: ClientOrchestrationCommand
  environment: ChatEnvironment
  threadId: ThreadId
}) {
  try {
    const result = await environment.dispatchCommand(command)
    log.info({
      action,
      area: 'chat',
      commandType: command.type,
      deduped: result.deduped,
      outcome: 'ok',
      sequence: result.sequence,
      threadId,
    })
  } catch (error) {
    log.warn({
      action,
      area: 'chat',
      commandType: command.type,
      outcome: 'error',
      reason: errorMessage(error, 'Chat command failed.'),
      threadId,
    })
  }
}
