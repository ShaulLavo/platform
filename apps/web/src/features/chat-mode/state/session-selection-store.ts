import type { ProjectId, ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

import type { SessionSelection } from '@/features/chat-mode/utils/active-session'
import { neighbourThreadId } from '@/features/chat-mode/utils/session-neighbour'
import {
  readSessionSelectionCache,
  writeSessionSelectionCache,
} from '@/features/workspace/state/cache'

/**
 * Which session the stage is showing. Selection lives outside the chat surface because
 * activating a project re-parents that tree, and the click that caused it has to
 * survive the remount.
 *
 * It also survives a reload: the pick is written to the workspace cache alongside every
 * other durable UI state, so a restart reopens the conversation that was on screen
 * instead of dropping to the newest thread.
 *
 * Project activation itself is not here — that is `active-project-store`, which the
 * editor also reads. This store only answers "which conversation inside it".
 */
type SessionSelectionStore = {
  /**
   * True while `selection` is still the one that came off disk. It is what tells a
   * remembered pick pointing at a deleted thread apart from a pick this session just
   * made whose thread is still travelling through the event stream.
   */
  readonly restored: boolean
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
  /**
   * A pick that came from an address rather than from a click. It sets `restored`,
   * which `selectSession` deliberately clears — without that distinction a link to a
   * deleted thread reports `resolving` forever and the stage sits on "Opening
   * session" instead of saying the conversation is gone.
   */
  readonly restoreSession: (projectId: ProjectId, threadId: ThreadId) => void
  readonly startDraft: (projectId: ProjectId) => void
}

/**
 * A factory rather than a bare store so a restart is something a test can perform:
 * building a second store reads the cache exactly the way a cold load does.
 */
export function createSessionSelectionStore() {
  const remembered = readSessionSelectionCache()
  const store = create<SessionSelectionStore>()((set) => ({
    releaseSession: (threadId, threadIds) =>
      set((state) => releasedSelection(state.selection, threadId, threadIds)),
    restored: remembered.kind !== 'auto',
    restoreSession: (projectId, threadId) =>
      set({ restored: true, selection: { kind: 'session', projectId, threadId } }),
    selection: remembered,
    selectSession: (projectId, threadId) =>
      set({ restored: false, selection: { kind: 'session', projectId, threadId } }),
    startDraft: (projectId) => set({ restored: false, selection: { kind: 'draft', projectId } }),
  }))

  // Written on the spot, not debounced: selections change at click speed, and a
  // trailing write is exactly the one a reload would lose.
  store.subscribe((state, previous) => {
    if (state.selection === previous.selection) return

    writeSessionSelectionCache(state.selection)
  })

  return store
}

export const useSessionSelectionStore = createSessionSelectionStore()

/** Drops both the live pick and the remembered one, the way a fresh profile starts. */
export function resetSessionSelectionStore() {
  useSessionSelectionStore.setState({ restored: false, selection: { kind: 'auto' } })
  writeSessionSelectionCache({ kind: 'auto' })
}

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
  if (!neighbour) return { restored: false, selection: { kind: 'auto' } as const }

  return {
    restored: false,
    selection: { kind: 'session', projectId: selection.projectId, threadId: neighbour } as const,
  }
}
