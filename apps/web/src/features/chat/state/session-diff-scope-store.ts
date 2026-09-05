import { scopedSessionKey, type ScopedSessionRef, type TurnId } from '@workspace/contracts'
import { create } from 'zustand'

import {
  nextSessionDiffScopeStamp,
  pruneSessionDiffScopes,
  readPersistedSessionDiffScopes,
  reconcileSessionDiffScope,
  writePersistedSessionDiffScopes,
  type PersistedSessionDiffScopeEntry,
  type SessionDiffScope,
} from '@/features/chat/utils/session-diff-scope-storage'

/**
 * Which diff each session was last looking at — the branch, the working tree, or
 * one turn's checkpoint. Per session rather than per pane: two sessions in the same
 * workspace are two different pieces of work, and coming back to one should come
 * back to what it was showing.
 */
type SessionDiffScopeStore = {
  scopeBySessionKey: Record<string, PersistedSessionDiffScopeEntry>
  /** Moves a pick off a turn a revert deleted. No-op when the pick still stands. */
  reconcileTurnScope: (ref: ScopedSessionRef, availableTurnIds: readonly TurnId[]) => void
  selectSessionDiffScope: (ref: ScopedSessionRef, scope: SessionDiffScope) => void
}

export const useSessionDiffScopeStore = create<SessionDiffScopeStore>((set) => ({
  scopeBySessionKey: readPersistedSessionDiffScopes().scopeBySessionKey,
  reconcileTurnScope: (ref, availableTurnIds) => {
    const sessionId = scopedSessionKey(ref)
    set((state) => {
      const current = state.scopeBySessionKey[sessionId]
      if (!current) return state

      const reconciled = reconcileSessionDiffScope(current.scope, availableTurnIds)
      if (!reconciled) return state

      return withSessionDiffScope(state, sessionId, reconciled)
    })
    persistSessionDiffScopes()
  },
  selectSessionDiffScope: (ref, scope) => {
    const sessionId = scopedSessionKey(ref)
    set((state) => withSessionDiffScope(state, sessionId, scope))
    persistSessionDiffScopes()
  },
}))

/** What a fresh page load does. Tests use it to prove a pick crossed localStorage. */
export function hydrateSessionDiffScopeStoreFromStorage() {
  useSessionDiffScopeStore.setState({
    scopeBySessionKey: readPersistedSessionDiffScopes().scopeBySessionKey,
  })
}

function persistSessionDiffScopes() {
  try {
    writePersistedSessionDiffScopes(useSessionDiffScopeStore.getState().scopeBySessionKey)
  } catch {
    // A full or blocked store costs the user a pane that reopens on the branch
    // diff. Nothing here is worth interrupting a click over.
  }
}

function withSessionDiffScope(
  state: SessionDiffScopeStore,
  sessionId: string,
  scope: SessionDiffScope,
) {
  return {
    scopeBySessionKey: pruneSessionDiffScopes({
      ...state.scopeBySessionKey,
      [sessionId]: { scope, updatedAt: nextSessionDiffScopeStamp(state.scopeBySessionKey) },
    }),
  }
}
