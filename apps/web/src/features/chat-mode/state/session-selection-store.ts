import type { EnvironmentId, ProjectId, ScopedSessionRef, SessionId } from '@workspace/contracts'
import { create } from 'zustand'

import type { SessionSelection } from '@/features/chat-mode/utils/active-session'
import { neighbourSessionId } from '@/features/chat-mode/utils/session-neighbour'
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
 * instead of dropping to the newest session.
 *
 * Project activation itself is not here — that is `active-project-store`, which the
 * editor also reads. This store only answers "which conversation inside it".
 */
type SessionSelectionStore = {
  /**
   * True while `selection` is still the one that came off disk. It is what tells a
   * remembered pick pointing at a deleted session apart from a pick this session just
   * made whose session is still travelling through the event stream.
   */
  readonly restored: boolean
  readonly selection: SessionSelection
  /**
   * Hands the stage over when this session stops being showable — archived or deleted.
   * Without it the stage would sit on "Opening session" forever, waiting for a session the
   * projection will never hand back. `sessionIds` is the rail's order for the session's
   * project, the departing session included, so the stage lands on the row next to the one
   * that went away instead of wherever the auto-pick happens to point.
   */
  readonly releaseSession: (ref: ScopedSessionRef, sessionIds: readonly SessionId[]) => void
  readonly selectSession: (
    environmentId: EnvironmentId,
    projectId: ProjectId,
    sessionId: SessionId,
  ) => void
  /**
   * A pick that came from an address rather than from a click. It sets `restored`,
   * which `selectSession` deliberately clears — without that distinction a link to a
   * deleted session reports `resolving` forever and the stage sits on "Opening
   * session" instead of saying the conversation is gone.
   */
  readonly restoreSession: (
    environmentId: EnvironmentId,
    projectId: ProjectId,
    sessionId: SessionId,
  ) => void
  readonly startDraft: (environmentId: EnvironmentId, projectId: ProjectId) => void
}

/**
 * A factory rather than a bare store so a restart is something a test can perform:
 * building a second store reads the cache exactly the way a cold load does.
 */
export function createSessionSelectionStore() {
  const remembered = readSessionSelectionCache()
  const store = create<SessionSelectionStore>()((set) => ({
    releaseSession: (ref, sessionIds) =>
      set((state) => releasedSelection(state.selection, ref, sessionIds)),
    restored: remembered.kind !== 'auto',
    restoreSession: (environmentId, projectId, sessionId) =>
      set({ restored: true, selection: { kind: 'session', environmentId, projectId, sessionId } }),
    selection: remembered,
    selectSession: (environmentId, projectId, sessionId) =>
      set({ restored: false, selection: { kind: 'session', environmentId, projectId, sessionId } }),
    startDraft: (environmentId, projectId) =>
      set({ restored: false, selection: { kind: 'draft', environmentId, projectId } }),
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
  ref: ScopedSessionRef,
  sessionIds: readonly SessionId[],
) {
  if (selection.kind !== 'session') return {}
  if (selection.environmentId !== ref.environmentId || selection.sessionId !== ref.sessionId)
    return {}

  const neighbour = neighbourSessionId(sessionIds, ref.sessionId)
  // Nothing adjacent: the project just lost its last session, or the departing one was
  // never in this list. Auto then shows the newest session left, or the composer.
  if (!neighbour) return { restored: false, selection: { kind: 'auto' } as const }

  return {
    restored: false,
    selection: {
      kind: 'session',
      environmentId: selection.environmentId,
      projectId: selection.projectId,
      sessionId: neighbour,
    } as const,
  }
}
