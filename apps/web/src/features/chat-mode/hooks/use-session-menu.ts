import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useSessionActions } from '@/features/chat-mode/hooks/use-session-actions'
import { openSessionRow, startSessionDraft } from '@/features/chat-mode/state/session-commands'
import {
  useSessionRailStore,
  type SessionRenameSurface,
} from '@/features/chat-mode/state/session-rail-store'
import { canStopAgentSession, sessionMenu } from '@/features/chat-mode/utils/session-menu'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'

/** `surface` decides which of the two places swaps for a rename field. */
export function useSessionMenu(session: SessionRailItem, surface: SessionRenameSurface) {
  const actions = useSessionActions()
  const scope = useSessionRailStore((state) => state.scope)
  const startRename = useSessionRailStore((state) => state.startRename)
  const setScope = useSessionRailStore((state) => state.setScope)
  // The rail item is a view model and carries no provider session; that comes from
  // the summary the projection already holds.
  const agentSession = useChatProjectionStore(
    (state) => state.sidebarThreadSummaryById[session.id]?.session,
  )

  return sessionMenu({
    archive: () => actions.archive(session.id),
    archived: session.archived,
    canStopAgent: canStopAgentSession(agentSession),
    deleteSession: () => actions.deleteSession(session.id, session.title),
    newSession: () => startSessionDraft(session.projectId),
    open: () => openSessionRow(session),
    rename: () => startRename({ surface, threadId: session.id }),
    scopedToProject: scope === session.projectId,
    scopeToProject: () => setScope(session.projectId),
    stopAgent: () => actions.stopAgent(session.id),
    unarchive: () => actions.unarchive(session.id),
  })
}
