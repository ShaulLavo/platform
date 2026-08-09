import type { ProjectId, ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

import type { SessionSelection } from '@/features/chat-mode/utils/active-session'
import { neighbourThreadId } from '@/features/chat-mode/utils/session-neighbour'

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
   * Hands the stage over when this session stops being showable — archived or deleted.
   * Without it the stage would sit on "Opening session" forever, waiting for a thread the
   * projection will never hand back. `threadIds` is the rail's order for the session's
   * project, the departing thread included, so the stage lands on the row next to the one
   * that went away instead of wherever the auto-pick happens to point.
   */
  readonly releaseSession: (threadId: ThreadId, threadIds: readonly ThreadId[]) => void
  readonly selectSession: (projectId: ProjectId, threadId: ThreadId) => void
  readonly startDraft: (projectId: ProjectId) => void
}

export const useSessionSelectionStore = create<SessionSelectionStore>()((set) => ({
  releaseSession: (threadId, threadIds) =>
    set((state) => releasedSelection(state.selection, threadId, threadIds)),
  selection: { kind: 'auto' },
  selectSession: (projectId, threadId) =>
    set({ selection: { kind: 'session', projectId, threadId } }),
  startDraft: (projectId) => set({ selection: { kind: 'draft', projectId } }),
}))

/** An empty patch leaves the store untouched, so an unrelated pick survives. */
function releasedSelection(
  selection: SessionSelection,
  threadId: ThreadId,
  threadIds: readonly ThreadId[],
) {
  if (selection.kind !== 'session') return {}
  if (selection.threadId !== threadId) return {}

  const neighbour = neighbourThreadId(threadIds, threadId)
  // Nothing adjacent: the project just lost its last session, or the departing one was
  // never in this list. Auto then shows the newest session left, or the composer.
  if (!neighbour) return { selection: { kind: 'auto' } as const }

  return {
    selection: { kind: 'session', projectId: selection.projectId, threadId: neighbour } as const,
  }
}
