import type { ThreadId, TurnId } from '@workspace/contracts'
import { create } from 'zustand'

import {
  nextThreadDiffScopeStamp,
  pruneThreadDiffScopes,
  readPersistedThreadDiffScopes,
  reconcileThreadDiffScope,
  writePersistedThreadDiffScopes,
  type PersistedThreadDiffScopeEntry,
  type ThreadDiffScope,
} from '@/features/chat/utils/thread-diff-scope-storage'

/**
 * Which diff each thread was last looking at — the branch, the working tree, or
 * one turn's checkpoint. Per thread rather than per pane: two threads in the same
 * workspace are two different pieces of work, and coming back to one should come
 * back to what it was showing.
 */
type ThreadDiffScopeStore = {
  scopeByThreadId: Record<ThreadId, PersistedThreadDiffScopeEntry>
  /** Moves a pick off a turn a revert deleted. No-op when the pick still stands. */
  reconcileTurnScope: (threadId: ThreadId, availableTurnIds: readonly TurnId[]) => void
  selectThreadDiffScope: (threadId: ThreadId, scope: ThreadDiffScope) => void
}

export const useThreadDiffScopeStore = create<ThreadDiffScopeStore>((set) => ({
  scopeByThreadId: readPersistedThreadDiffScopes().scopeByThreadId,
  reconcileTurnScope: (threadId, availableTurnIds) => {
    set((state) => {
      const current = state.scopeByThreadId[threadId]
      if (!current) return state

      const reconciled = reconcileThreadDiffScope(current.scope, availableTurnIds)
      if (!reconciled) return state

      return withThreadDiffScope(state, threadId, reconciled)
    })
    persistThreadDiffScopes()
  },
  selectThreadDiffScope: (threadId, scope) => {
    set((state) => withThreadDiffScope(state, threadId, scope))
    persistThreadDiffScopes()
  },
}))

/** What a fresh page load does. Tests use it to prove a pick crossed localStorage. */
export function hydrateThreadDiffScopeStoreFromStorage() {
  useThreadDiffScopeStore.setState({
    scopeByThreadId: readPersistedThreadDiffScopes().scopeByThreadId,
  })
}

function persistThreadDiffScopes() {
  try {
    writePersistedThreadDiffScopes(useThreadDiffScopeStore.getState().scopeByThreadId)
  } catch {
    // A full or blocked store costs the user a pane that reopens on the branch
    // diff. Nothing here is worth interrupting a click over.
  }
}

function withThreadDiffScope(
  state: ThreadDiffScopeStore,
  threadId: ThreadId,
  scope: ThreadDiffScope,
) {
  return {
    scopeByThreadId: pruneThreadDiffScopes({
      ...state.scopeByThreadId,
      [threadId]: { scope, updatedAt: nextThreadDiffScopeStamp(state.scopeByThreadId) },
    }),
  }
}
