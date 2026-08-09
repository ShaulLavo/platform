import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useSessionActions } from '@/features/chat-mode/hooks/use-session-actions'
import { useSessionRail } from '@/features/chat-mode/providers/rail-context'
import { canStopAgentSession, sessionMenu } from '@/features/chat-mode/utils/session-menu'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'

export function useSessionMenu(session: SessionRailItem) {
  const rail = useSessionRail()
  const actions = useSessionActions()
  // The rail item is a view model and carries neither the archive stamp nor the
  // provider session; both come from the summary the projection already holds.
  const summary = useChatProjectionStore((state) => state.sidebarThreadSummaryById[session.id])

  return sessionMenu({
    archive: () => actions.archive(session.id),
    archived: Boolean(summary?.archivedAt),
    canStopAgent: canStopAgentSession(summary?.session),
    deleteSession: () => actions.deleteSession(session.id, session.title),
    newSession: () => rail.startNewSession(session.projectId),
    open: () => rail.openSession(session),
    rename: () => rail.startRename(session.id),
    scopedToProject: rail.scope === session.projectId,
    scopeToProject: () => rail.setScope(session.projectId),
    stopAgent: () => actions.stopAgent(session.id),
    unarchive: () => actions.unarchive(session.id),
  })
}
