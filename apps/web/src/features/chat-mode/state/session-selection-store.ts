import type { ProjectId, ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

import type { SessionSelection } from '@/features/chat-mode/utils/active-session'

/**
 * Which session the stage is showing. Selection lives outside the chat surface because
 * activating a project re-parents that tree, and the click that caused it has to
 * survive the remount.
 *
 * Project activation itself is not here — that is `active-project-store`, which the
 * editor also reads. This store only answers "which conversation inside it".
 */
type SessionSelectionStore = {
  readonly selection: SessionSelection
  /**
   * Drops a pick that names this session, for when it stops being showable —
   * archived or deleted. Without it the stage would sit on "Opening session"
   * forever, waiting for a thread the projection will never hand back.
   */
  readonly clearSession: (threadId: ThreadId) => void
  readonly selectSession: (projectId: ProjectId, threadId: ThreadId) => void
  readonly startDraft: (projectId: ProjectId) => void
}

export const useSessionSelectionStore = create<SessionSelectionStore>()((set) => ({
  clearSession: (threadId) => set((state) => clearedSelection(state.selection, threadId)),
  selection: { kind: 'auto' },
  selectSession: (projectId, threadId) =>
    set({ selection: { kind: 'session', projectId, threadId } }),
  startDraft: (projectId) => set({ selection: { kind: 'draft', projectId } }),
}))

/** An empty patch leaves the store untouched, so an unrelated pick survives. */
function clearedSelection(selection: SessionSelection, threadId: ThreadId) {
  if (selection.kind !== 'session') return {}
  if (selection.threadId !== threadId) return {}

  return { selection: { kind: 'auto' } as const }
}
