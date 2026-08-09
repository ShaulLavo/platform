import type { ClientOrchestrationCommand, ThreadId } from '@workspace/contracts'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import {
  createThreadArchiveCommand,
  createThreadDeleteCommand,
  createThreadRenameCommand,
  createThreadSessionStopCommand,
  createThreadUnarchiveCommand,
} from '@/features/chat/lib/chat-command-builders'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { log } from '@/lib/client-logging'
import { errorMessage } from '@/lib/error-message'

/**
 * The only place chat mode mutates a thread. Every action is fire-and-forget:
 * the server's event lands on the shell stream and the projection redraws the
 * rail, so nothing here waits on the response to update the UI.
 */
export function useSessionActions() {
  const { environment } = useChatModeSession()
  const clearSession = useSessionSelectionStore((state) => state.clearSession)

  function dispatch(action: string, threadId: ThreadId, command: ClientOrchestrationCommand) {
    void dispatchSessionCommand({ action, command, environment, threadId })
  }

  return {
    archive(threadId: ThreadId) {
      // The rail hides archived sessions, so the stage must let go of this one
      // before it vanishes from the list.
      clearSession(threadId)
      dispatch(
        'chat.session.archive',
        threadId,
        createThreadArchiveCommand({ archivedAt: new Date().toISOString(), threadId }),
      )
    },
    deleteSession(threadId: ThreadId, title: string) {
      if (!confirmSessionDelete(title)) return

      clearSession(threadId)
      dispatch(
        'chat.session.delete',
        threadId,
        createThreadDeleteCommand({ deletedAt: new Date().toISOString(), threadId }),
      )
    },
    /** `title` must already be trimmed and non-empty — the server rejects blanks. */
    rename(threadId: ThreadId, title: string) {
      dispatch(
        'chat.session.rename',
        threadId,
        createThreadRenameCommand({ threadId, title, updatedAt: new Date().toISOString() }),
      )
    },
    stopAgent(threadId: ThreadId) {
      dispatch(
        'chat.session.stopAgent',
        threadId,
        createThreadSessionStopCommand({ createdAt: new Date().toISOString(), threadId }),
      )
    },
    unarchive(threadId: ThreadId) {
      dispatch(
        'chat.session.unarchive',
        threadId,
        createThreadUnarchiveCommand({ threadId, updatedAt: new Date().toISOString() }),
      )
    },
  }
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

/** Deleting drops the whole event history for the thread and cannot be undone. */
function confirmSessionDelete(title: string) {
  if (typeof window === 'undefined') return true
  if (typeof window.confirm !== 'function') return true

  return window.confirm(
    [`Delete “${title}”?`, 'This removes the session and its history permanently.'].join('\n'),
  )
}
