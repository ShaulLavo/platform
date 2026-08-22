import {
  selectChatProjects,
  selectChatSessionThreads,
} from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import { sessionRailModel } from '@/features/chat-mode/utils/session-rail-model'

/**
 * The palette's view of chat: every project's inbox in one list, built from the same
 * model the rail draws so a session reads identically in both places. Archived sessions
 * stay out — the palette is for getting back to work, not for browsing the filing.
 */
export function useCommandPaletteSessions() {
  const projects = useChatProjectionStore(selectChatProjects)
  const threads = useChatProjectionStore(selectChatSessionThreads)
  const seenByThreadId = useSessionReadStore((state) => state.seenByThreadId)
  const model = sessionRailModel({
    projects,
    seenByThreadId,
    threads,
    view: 'active',
  })

  return { projects: model.projects, sessions: model.sessions }
}
